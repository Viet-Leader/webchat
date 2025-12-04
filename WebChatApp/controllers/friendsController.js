const db = require('../config/db');

// Search users by keyword (exclude current user)
exports.searchUsers = (req, res) => {
  const keyword = req.query.q || '';
  const currentId = Number(req.query.exclude || 0);

 const sql = `
    SELECT 
      u.id, u.username, u.fullname, u.avatar,

      /* Trạng thái A → B (người đang search → người tìm thấy) */
      (
        SELECT status 
        FROM friends 
        WHERE user_id = ? AND friend_id = u.id
        LIMIT 1
      ) AS relation_from_A,

      /* Trạng thái B → A (người tìm thấy → người đang search) */
      (
        SELECT status 
        FROM friends 
        WHERE user_id = u.id AND friend_id = ?
        LIMIT 1
      ) AS relation_from_B

    FROM users u
    WHERE (u.username LIKE ? OR u.fullname LIKE ?)
      AND u.id != ?
    LIMIT 50
`;

  db.query(sql, [
    currentId,  
    currentId,  
    `%${keyword}%`, 
    `%${keyword}%`, 
    currentId
  ], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const processed = rows.map(u => {
      // ============================
      // QUY TẮC XÁC ĐỊNH TRẠNG THÁI
      // ============================

      let relationship = "none";

      if (u.relation_from_A === "accepted" || u.relation_from_B === "accepted") {
        relationship = "friend";
      }
      else if (u.relation_from_A === "pending") {
        relationship = "pending_sent";      // Tôi đã gửi
      }
      else if (u.relation_from_B === "pending") {
        relationship = "pending_received";  // Người ta gửi cho tôi
      }

      return {
        id: u.id,
        username: u.username,
        fullname: u.fullname,
        avatar: u.avatar,
        relationship
      };
    });

    res.json(processed);
  });
};


// Send friend request: create both directions (A->B pending, B->A pending)
// Use INSERT IGNORE to avoid duplicates (requires unique index on (user_id,friend_id))
exports.sendFriendRequest = (req, res) => {
  const { sender_id, receiver_id } = req.body;
  if (!sender_id || !receiver_id) return res.status(400).json({ message: 'Thiếu thông tin' });
  if (sender_id == receiver_id) return res.status(400).json({ message: 'Không thể kết bạn với chính mình' });

  // Check if a relationship already exists in either direction
  const checkSql = `SELECT * FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)`;
  db.query(checkSql, [sender_id, receiver_id, receiver_id, sender_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // If any accepted exists -> already friends
    if (rows.some(r => r.status === 'accepted')) {
      return res.status(400).json({ message: 'Đã là bạn bè' });
    }

    // Chỉ tạo 1 chiều: sender_id gửi request cho receiver_id
    // Không tạo chiều ngược lại để tránh người gửi thấy nút "Chấp nhận"
    const sql = `
      INSERT INTO friends (user_id, friend_id, status)
      VALUES (?, ?, 'pending')
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `;
    db.query(sql, [sender_id, receiver_id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      // Gửi real-time notification cho người nhận (nếu có socket.io)
      if (req.io) {
        // Lấy thông tin người gửi để hiển thị
        db.query('SELECT id, username, fullname, avatar FROM users WHERE id = ?', [sender_id], (err3, userRows) => {
          if (!err3 && userRows.length > 0) {
            const senderInfo = userRows[0];
            req.io.to(String(receiver_id)).emit('newFriendRequest', {
              requester_id: sender_id,
              username: senderInfo.username,
              fullname: senderInfo.fullname,
              avatar: senderInfo.avatar,
              message: `${senderInfo.fullname || senderInfo.username} đã gửi lời mời kết bạn`
            });
            console.log(`📬 Friend request sent from ${sender_id} to ${receiver_id}`);
          }
        });
      }
      
      return res.json({ message: 'Đã gửi lời mời' });
    });
  });
};

// Accept friend request: set status accepted for both directions
exports.acceptFriendRequest = (req, res) => {
  const { user_id, friend_id } = req.body; // user_id = người chấp nhận, friend_id = người gửi trước đó
  if (!user_id || !friend_id) return res.status(400).json({ message: 'Thiếu thông tin' });

  // Update both records to accepted
  const updateSql = `
    UPDATE friends SET status = 'accepted'
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `;
  db.query(updateSql, [user_id, friend_id, friend_id, user_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    // Ensure both directions exist (insert if missing)
    const insertSql = `
      INSERT INTO friends (user_id, friend_id, status)
      SELECT ?, ?, 'accepted'
      FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?
      )
    `;
    db.query(insertSql, [user_id, friend_id, user_id, friend_id], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      // Gửi real-time notification cho cả 2 người
      if (req.io) {
        // Lấy thông tin người chấp nhận để gửi cho người gửi request
        db.query('SELECT id, username, fullname, avatar FROM users WHERE id = ?', [user_id], (err3, userRows) => {
          if (!err3 && userRows.length > 0) {
            const accepterInfo = userRows[0];
            // Thông báo cho người gửi request (friend_id) rằng đã được chấp nhận
            req.io.to(String(friend_id)).emit('friendRequestAccepted', {
              friend_id: user_id,
              username: accepterInfo.username,
              fullname: accepterInfo.fullname,
              avatar: accepterInfo.avatar,
              message: `${accepterInfo.fullname || accepterInfo.username} đã chấp nhận lời mời kết bạn`
            });
            console.log(`✅ Friend request accepted: ${user_id} accepted ${friend_id}'s request`);
          }
        });
        
        // Thông báo cho người chấp nhận (user_id) để refresh friend list
        req.io.to(String(user_id)).emit('friendListUpdated', {
          message: 'Danh sách bạn bè đã được cập nhật'
        });
      }
      
      return res.json({ message: 'Đã chấp nhận yêu cầu' });
    });
  });
};

// Get list of friends for a user (those with status = accepted)
exports.getFriends = (req, res) => {
  const userId = req.params.userId;
  const sql = `
    SELECT u.id, u.username, u.fullname, u.avatar, f.status, f.created_at
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ? AND f.status = 'accepted'
    ORDER BY f.created_at DESC
  `;
  db.query(sql, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

// (Optional) Get friend requests received by user (pending where user is target)
// Get friend requests (SỬA: Đã có u.avatar, thêm fallback)
exports.getFriendRequests = (req, res) => {
  const userId = req.params.userId;
  const sql = `
    SELECT f.id, f.user_id AS requester_id, u.username, u.fullname, u.avatar, f.created_at
    FROM friends f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `;
  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error('Requests query error:', err);
      return res.status(500).json({ error: err.message });
    }

    const requestsWithAvatar = rows.map(req => ({
      ...req,
      avatar: req.avatar || null  // ✅ Fallback null cho base64
    }));

    res.json(requestsWithAvatar);
  });
};
// Người nhận từ chối yêu cầu kết bạn
exports.rejectFriendRequest = (req, res) => {
  const { user_id, friend_id } = req.body;

  const sql = `
    DELETE FROM friends
    WHERE user_id = ? AND friend_id = ? AND status = 'pending'
  `;

  db.query(sql, [friend_id, user_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (req.io) {
      req.io.to(String(friend_id)).emit("friendRequestRejected", {
        sender_id: friend_id
      });
    }

    return res.json({
      message: "Đã từ chối yêu cầu",
      relationship: "none"
    });
  });
};
exports.cancelFriendRequest = (req, res) => {
  const { user_id, friend_id } = req.body;

  const sql = `
    DELETE FROM friends
    WHERE user_id = ? AND friend_id = ? AND status = 'pending'
  `;

  db.query(sql, [user_id, friend_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (req.io) {
      req.io.to(String(friend_id)).emit("friendRequestCanceled", {
        sender_id: user_id
      });
    }

    return res.json({
      message: "Đã hủy lời mời",
      relationship: "none"
    });
  });
};
exports.unfriend = (req, res) => {
  const { user_id, friend_id } = req.body;

  const sql = `
    DELETE FROM friends
    WHERE (user_id = ? AND friend_id = ?)
       OR (user_id = ? AND friend_id = ?)
  `;

  db.query(sql, [user_id, friend_id, friend_id, user_id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    if (req.io) {
      req.io.to(String(friend_id)).emit("unfriended", { user_id });
      req.io.to(String(user_id)).emit("friendListUpdated", {});
    }

    return res.json({ message: "Đã hủy bạn bè" });
  });
};

