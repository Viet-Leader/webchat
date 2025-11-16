const db = require('../config/db');

// Lấy lịch sử tin nhắn giữa 2 user
exports.getMessages = (req, res) => {
  const { senderId, receiverId } = req.params;

  // (Tùy chọn) kiểm tra 2 user là bạn bè (accepted) trước khi trả lịch sử
  const checkSql = `
    SELECT 1 FROM friends
    WHERE user_id = ? AND friend_id = ? AND status = 'accepted'
    LIMIT 1
  `;
  db.query(checkSql, [senderId, receiverId], (err, chkRows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Nếu không là bạn bè, có thể vẫn cho xem (tùy app). Ở đây ta cho phép xem lịch sử nếu có record message,
    // nhưng nếu bạn muốn chặn, uncomment đoạn sau:
    // if (chkRows.length === 0) return res.status(403).json({ message: 'Không phải bạn bè' });

    const sql = `
      SELECT m.*, 
             u_sender.username AS sender_username, 
             u_sender.fullname AS sender_fullname,
             u_receiver.username AS receiver_username,
             u_receiver.fullname AS receiver_fullname
      FROM messages m
      LEFT JOIN users u_sender ON u_sender.id = m.sender_id
      LEFT JOIN users u_receiver ON u_receiver.id = m.receiver_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `;
    db.query(sql, [senderId, receiverId, receiverId, senderId], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      
      // Normalize tin nhắn cũ từ database: loại bỏ ký tự xuống dòng
      const normalizedRows = rows.map(row => ({
        ...row,
        message: String(row.message || '')
          .replace(/\r\n/g, ' ') // Thay thế Windows newline (CRLF)
          .replace(/\n/g, ' ') // Thay thế Unix newline (LF)
          .replace(/\r/g, ' ') // Thay thế Mac newline (CR)
          .replace(/[\u2028\u2029]/g, ' ') // Thay thế Unicode line/paragraph separator
          .replace(/\s+/g, ' ') // Thay thế nhiều khoảng trắng bằng 1 khoảng trắng
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // Loại bỏ zero-width characters
          .trim()
      }));
      
      res.json(normalizedRows);
    });
  });
};

// Gửi tin nhắn: lưu vào DB rồi trả về (backend kiểm tra là bạn bè trước khi lưu)
exports.sendMessage = (req, res) => {
  const { sender_id, receiver_id, message } = req.body;
  if (!sender_id || !receiver_id || !message) return res.status(400).json({ message: 'Thiếu thông tin' });

  // Normalize tin nhắn: loại bỏ ký tự xuống dòng không mong muốn
  let normalizedMessage = String(message)
    .replace(/\r\n/g, ' ') // Thay thế Windows newline (CRLF)
    .replace(/\n/g, ' ') // Thay thế Unix newline (LF)
    .replace(/\r/g, ' ') // Thay thế Mac newline (CR)
    .replace(/[\u2028\u2029]/g, ' ') // Thay thế Unicode line/paragraph separator
    .replace(/\s+/g, ' ') // Thay thế nhiều khoảng trắng bằng 1 khoảng trắng
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Loại bỏ zero-width characters
    .trim();
  
  if (!normalizedMessage) {
    return res.status(400).json({ message: 'Tin nhắn không hợp lệ' });
  }

  const checkSql = `SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted' LIMIT 1`;
  db.query(checkSql, [sender_id, receiver_id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Chưa là bạn bè' });
    }

    const sql = `INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)`;
    db.query(sql, [sender_id, receiver_id, normalizedMessage], (err2, result) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ message: 'OK', id: result.insertId, created_at: new Date() });
    });
  });
};
