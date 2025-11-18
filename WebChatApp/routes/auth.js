const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// =======================
// ĐĂNG KÝ
// =======================
router.post('/register', async (req, res) => {
  const { username, password, fullname, avatar } = req.body;

  if (!username || !password || !fullname) {
    return res.status(400).json({ message: 'Thiếu thông tin!' });
  }

  try {
    // Kiểm tra trùng username
    const [rows] = await db.promise().query(
      'SELECT * FROM users WHERE username = ?', 
      [username]
    );

    if (rows.length > 0) {
      return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
    }

    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Thêm user vào DB
    await db.promise().query(
      'INSERT INTO users (username, password, fullname, avatar) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, fullname, avatar || 'default.png']
    );

    res.json({ message: 'Đăng ký thành công!' });

  } catch (err) {
    console.error('❌ Register Error:', err.message);
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

// =======================
// ĐĂNG NHẬP
// =======================
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Thiếu thông tin!' });
  }

  try {
    const [rows] = await db.promise().query(
      'SELECT * FROM users WHERE username = ?', 
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
    }

    const user = rows[0];

    // Kiểm tra mật khẩu
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Sai mật khẩu!' });
    }

    // Tạo token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      "MY_SECRET",
      { expiresIn: "2h" }
    );

    // TRẢ VỀ ID ĐÚNG CỦA DB
    res.json({
      message: 'Đăng nhập thành công!',
      token,
      user: {
        id: user.id,
        username: user.username,
        fullname: user.fullname,
        avatar: user.avatar
      }
    });

  } catch (err) {
    console.error('❌ Login Error:', err.message);
    res.status(500).json({ message: 'Lỗi server!' });
  }
});

module.exports = router;
