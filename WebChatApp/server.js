require('dotenv').config();
console.log('🔑 Env Debug - JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded: ' + process.env.JWT_SECRET : 'MISSING!');
if (!process.env.JWT_SECRET) {
  console.error('🚨 CRITICAL: JWT_SECRET missing! Check .env file.');
  process.exit(1);  // Tạm dừng server nếu missing, để dễ debug
}
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');  // ← Thêm dòng này
const db = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Fallback cho root (DI CHUYỂN LÊN TRƯỚC STATIC) ← Fix chính: Ưu tiên route trước static
app.get('/', (req, res) => {
  const loginPath = path.join(__dirname, 'public/login.html');
  console.log('📄 Root fallback: Serving', loginPath);  // Debug: Sẽ thấy log này khi truy cập /
  res.sendFile(loginPath);
});

// Static với đường dẫn tuyệt đối (đặt SAU route /)
const publicPath = path.join(__dirname, 'public');
console.log('📁 Public path (static):', publicPath);  // Debug: Log đường dẫn
app.use(express.static(publicPath));

// Import và mount routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Start server
const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));