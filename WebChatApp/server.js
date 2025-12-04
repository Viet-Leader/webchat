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
  cors: {  
    origin: process.env.NODE_ENV === 'development' ? '*' : 'http://localhost:3001',
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
app.use('/api/auth', authRoutes);
app.use("/api/users", require("./routes/users"));
app.use('/api/friends', (req, res, next) => {
  req.io = io; 
  next();
}, friendRoutes);
app.use('/api/messages', messageRoutes);

// API Profile
app.get('/api/user/profile', (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'Thiếu userId trong query' });
  }

  const sql = 'SELECT username, fullname, avatar FROM users WHERE id = ?';
  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Lỗi truy vấn DB' });
    if (results.length === 0) return res.status(404).json({ error: 'User không tồn tại' });

    const user = results[0];
    let avatar = user.avatar;

    if (avatar && !avatar.startsWith('data:image') && avatar.startsWith('/')) {
      avatar = `http://localhost:3001${avatar}`; 
    }

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

  // 1. Khi người dùng đăng ký socket (Xử lý Online)
  socket.on('registerSocket', (payload) => {
    if (payload?.userId) {
      const userId = String(payload.userId);
      onlineUsers.set(userId, socket.id);
      socket.join(userId);

      console.log(`✅ User ${userId} is Online`);

      // A. Báo cho TẤT CẢ mọi người: "User này vừa Online"
      io.emit('userOnline', { userId: userId });

      // B. Gửi riêng cho User này danh sách những người đang Online khác
      const listOnline = Array.from(onlineUsers.keys());
      socket.emit('getOnlineUsers', listOnline);
    }
  });

  // 2. Xử lý tin nhắn
  socket.on('sendMessage', (data) => {
    const { sender_id, receiver_id, message } = data;

    if (!sender_id || !receiver_id || !message) {
      return socket.emit('error', { message: 'Missing fields' });
    }

    let normalizedMessage = String(message).trim();
    if (!normalizedMessage) return socket.emit('error', { message: 'Tin nhắn không hợp lệ' });

    const checkFriendSql = `SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted' LIMIT 1`;
    db.query(checkFriendSql, [sender_id, receiver_id], (err, friendRows) => {
      if (err || friendRows.length === 0) return socket.emit('error', { message: 'Lỗi hoặc chưa kết bạn' });

      db.query(
        "INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)",
        [sender_id, receiver_id, normalizedMessage],
        (err2, result) => {
          if (err2) return socket.emit('error', { message: 'DB error' });

          const payload = {
            id: result.insertId,
            sender_id,
            receiver_id,
            message: normalizedMessage,
            created_at: new Date()
          };

          io.to(String(receiver_id)).emit('receiveMessage', payload);
          io.to(String(sender_id)).emit('messageSent', payload);
        }
      );
    });
  });

  // 3. TÍNH NĂNG TYPING (ĐÃ SỬA)
  socket.on('typing', (data) => {
    socket.to(String(data.receiver_id)).emit('displayTyping', data);
  });

  socket.on('stopTyping', (data) => {
    socket.to(String(data.receiver_id)).emit('hideTyping', data);
  });

  // 4. Các sự kiện khác
  socket.on('join', (userId) => {
    socket.join(String(userId));
  });

  // 5. Xử lý Offline (Gộp chung logic disconnect)
  socket.on('disconnect', () => {
    let disconnectedUserId = null;
    // Tìm user vừa thoát
    for (const [userId, sid] of onlineUsers.entries()) {
      if (sid === socket.id) {
        disconnectedUserId = userId;
        onlineUsers.delete(userId);
        break;
      }
    }

    if (disconnectedUserId) {
      console.log(`❌ User ${disconnectedUserId} is Offline`);
      // Báo cho mọi người biết
      io.emit('userOffline', { userId: disconnectedUserId });
    }
    console.log('Socket disconnected', socket.id);
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});