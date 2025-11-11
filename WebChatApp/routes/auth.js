const express = require('express');  // Dòng 1: Đảm bảo require express
const router = express.Router();     // Dòng 2: Định nghĩa router ở đây
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Đăng ký
router.post('/register', async (req, res) => {
  const { username, password, fullname } = req.body;
  if (!username || !password || !fullname) {
    return res.status(400).json({ message: 'Thiếu thông tin!' });
  }

  try {
    // Kiểm tra username trùng
    const [rows] = await db.promise().query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length > 0) {
      return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Lưu DB
    await db.promise().query(
      'INSERT INTO users (username, password, fullname) VALUES (?, ?, ?)',
      [username, hashedPassword, fullname]
    );

    res.json({ message: 'Đăng ký thành công!' });
  } catch (err) {
    console.error('❌ Register Error:', err.message);
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

// Đăng nhập (với debug log để fix 500)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Thiếu thông tin!' });
  }

  try {
    console.log('🔍 Login attempt for username:', username);  // Debug 1
    const [rows] = await db.promise().query('SELECT * FROM users WHERE username = ?', [username]);
    console.log('📊 Query result rows.length:', rows.length);  // Debug 2
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
    }

    const user = rows[0];
    console.log('👤 User found:', { id: user.id, username: user.username });  // Debug 3: Check user.id

    const match = await bcrypt.compare(password, user.password);
    console.log('🔑 Password match:', match);  // Debug 4
    if (!match) {
      return res.status(401).json({ message: 'Sai mật khẩu!' });
    }

    // Tạo token
    console.log('🛡️ JWT_SECRET loaded:', !!process.env.JWT_SECRET ? 'Yes' : 'No');  // Debug 5
    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
      expiresIn: '2h',
    });
    console.log('✅ Token created successfully');  // Debug 6

    res.json({
      message: 'Đăng nhập thành công!',
      token,
      user: { id: user.id, username: user.username, fullname: user.fullname },
    });
  } catch (err) {
    console.error('❌ Login Error Details:', {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ message: 'Lỗi server!', details: err.message });  // Tạm thêm details
  }
});

module.exports = router;  // Export ở cuối