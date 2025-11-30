require('dotenv').config();
if (!process.env.JWT_SECRET) {
  console.error('🚨 JWT_SECRET missing! Check .env file.');
  process.exit(1);
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./config/db');

const friendRoutes = require('./routes/friends');
const messageRoutes = require('./routes/messages');
const authRoutes = require('./routes/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {  // Config CORS cho Socket để frontend connect dễ (tránh lỗi cross-origin)
    origin: process.env.NODE_ENV === 'development' ? '*' : 'http://localhost:3001',  // Thay 'http://localhost:3000' bằng frontend URL nếu khác
    methods: ['GET', 'POST']
  }
});

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// --- Static files ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// --- Root fallback ---
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'login.html'));
});

// --- API routes ---
// Pass io instance to routes để có thể gửi real-time notifications
app.use('/api/auth', authRoutes);
app.use("/api/users", require("./routes/users"));
app.use('/api/friends', (req, res, next) => {
  req.io = io; // Thêm io vào request để controller có thể dùng
  next();
}, friendRoutes);
app.use('/api/messages', messageRoutes);
// THÊM ROUTE PROFILE MỚI (tạm thời ở đây, sau migrate sang routes/users)
app.get('/api/user/profile', (req, res) => {
  console.log('🔍 API /profile called with userId:', req.query.userId); // Debug log

  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Thiếu userId trong query' });
  }

  // Query DB: Lấy username, fullname, avatar (giả sử bảng users có cột id, username, fullname, avatar)
  // Avatar: Hỗ trợ base64 (như profile.js) hoặc path file
  const sql = 'SELECT username, fullname, avatar FROM users WHERE id = ?';
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('❌ DB query error in /profile:', err);
      return res.status(500).json({ error: 'Lỗi truy vấn DB' });
    }
    if (results.length === 0) {
      console.error('❌ User không tồn tại:', userId);
      return res.status(404).json({ error: 'User không tồn tại' });
    }

    const user = results[0];
    let avatar = user.avatar;

    // Xử lý avatar:
    // - Nếu base64 (data:image...), trả nguyên
    // - Nếu path file (ví dụ: /img/avatars/1.png), thêm full URL
    // - Nếu null, để null (frontend fallback)
    if (avatar && !avatar.startsWith('data:image') && avatar.startsWith('/')) {
      avatar = `http://localhost:3001${avatar}`; // Port 3001 từ server của bạn
    }

    // Trả JSON khớp với frontend (scripts.js expect username/fullname, avatar)
    res.json({
      username: user.username,
      fullname: user.fullname || user.username,
      avatar: avatar
    });
  });
});
// --- Socket.io ---
const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  // Register user after socket connect
  socket.on('registerSocket', (payload) => {
    if (payload?.userId) {
      onlineUsers.set(String(payload.userId), socket.id);
      socket.join(String(payload.userId)); // join room
      console.log('Registered socket for user', payload.userId, '=>', socket.id);
    }
  });

  socket.on('sendMessage', (data) => {
    const { sender_id, receiver_id, message } = data;

    // 1. Kiểm tra dữ liệu
    if (!sender_id || !receiver_id || !message) {
      console.log("Missing fields:", data);
      return socket.emit('error', { message: 'Missing fields' });
    }

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
      return socket.emit('error', { message: 'Tin nhắn không hợp lệ' });
    }

    // 2. Kiểm tra là bạn bè trước khi gửi
    const checkFriendSql = `SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted' LIMIT 1`;
    db.query(checkFriendSql, [sender_id, receiver_id], (err, friendRows) => {
      if (err) {
        console.log("Friend check error:", err);
        return socket.emit('error', { message: 'Friend check error' });
      }

      if (friendRows.length === 0) {
        console.log("Not friends:", sender_id, receiver_id);
        return socket.emit('error', { message: 'Chưa là bạn bè' });
      }

      // 3. Lưu vào DB (sử dụng normalizedMessage)
      db.query(
        "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)",
        [sender_id, receiver_id, normalizedMessage],
        (err2, result) => {
          if (err2) {
            console.log("DB Error:", err2);
            return socket.emit('error', { message: 'DB error' });
          }

          const payload = {
            id: result.insertId,
            sender_id,
            receiver_id,
            message: normalizedMessage,
            created_at: new Date()
          };

          // Debug: Log tin nhắn trước khi gửi
          console.log(`📨 Message sent from ${sender_id} to ${receiver_id}:`, {
            original: message,
            normalized: normalizedMessage,
            savedToDB: normalizedMessage
          });

          // 4. Gửi cho người nhận (phải JOIN room trước)
          io.to(String(receiver_id)).emit('receiveMessage', payload);
          
          // 5. Gửi lại cho người gửi để hiển thị ngay
          io.to(String(sender_id)).emit('messageSent', payload);
        }
      );
    });
  });

  socket.on('join', (userId) => {
    socket.join(String(userId));
  });
  socket.on('disconnect', () => {
    for (const [userId, sid] of onlineUsers.entries()) {
      if (sid === socket.id) onlineUsers.delete(userId);
    }
    console.log('Socket disconnected', socket.id);
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces để các máy khác có thể kết nối
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`📡 Socket.io ready for connections from any device`);
});
