const express = require('express');
const router = express.Router();
const db = require('../config/db');
const verifyToken = require('../middleware/auth');

// ✅ Tìm kiếm người dùng (public)
router.get('/', verifyToken, async (req, res) => {
  const { q } = req.query;
  const user_id = req.user.id;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ message: 'Cần nhập từ khóa tìm kiếm!' });
  }

  try {
    const searchTerm = `%${q}%`;
    const [results] = await db.promise().query(
      `SELECT u.id, u.username, u.fullname, u.avatar, u.bio,
              CASE 
                WHEN u.id = ? THEN 'self'
                WHEN EXISTS(
                  SELECT 1 FROM friends f 
                  WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?))
                  AND f.status = 'accepted'
                ) THEN 'friend'
                WHEN EXISTS(
                  SELECT 1 FROM friends f 
                  WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?))
                  AND f.status = 'pending'
                ) THEN 'pending'
                ELSE 'stranger'
              END as relationship
       FROM users u
       WHERE (u.username LIKE ? OR u.fullname LIKE ?) AND u.id != ?
       LIMIT 20`,
      [user_id, user_id, user_id, user_id, user_id, searchTerm, searchTerm, user_id]
    );

    res.json(results);
  } catch (err) {
    console.error('❌ Search Users Error:', err.message);
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// ✅ Tìm kiếm người dùng (search)
router.get('/search', verifyToken, async (req, res) => {
  const { q } = req.query;
  const user_id = req.user.id;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ message: 'Cần nhập từ khóa tìm kiếm!' });
  }

  try {
    const searchTerm = `%${q}%`;
    const [results] = await db.promise().query(
      `SELECT u.id, u.username, u.fullname, u.avatar, u.bio,
              CASE 
                WHEN u.id = ? THEN 'self'
                WHEN EXISTS(
                  SELECT 1 FROM friends f 
                  WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?))
                  AND f.status = 'accepted'
                ) THEN 'friend'
                WHEN EXISTS(
                  SELECT 1 FROM friends f 
                  WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = ?))
                  AND f.status = 'pending'
                ) THEN 'pending'
                ELSE 'stranger'
              END as relationship
       FROM users u
       WHERE (u.username LIKE ? OR u.fullname LIKE ?) AND u.id != ?
       LIMIT 20`,
      [user_id, user_id, user_id, user_id, user_id, searchTerm, searchTerm, user_id]
    );

    res.json(results);
  } catch (err) {
    console.error('❌ Search Users Error:', err.message);
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

// ✅ Tìm kiếm người dùng đã kết bạn (chức năng chính)
router.get('/friends/search', verifyToken, async (req, res) => {
  const { q } = req.query;
  const user_id = req.user.id;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ message: 'Cần nhập từ khóa tìm kiếm!' });
  }

  try {
    const searchTerm = `%${q}%`;
    const [results] = await db.promise().query(
      `SELECT u.id, u.username, u.fullname, u.avatar, u.bio
       FROM users u
       INNER JOIN friends f ON (
         (f.user_id = ? AND f.friend_id = u.id) OR 
         (f.user_id = u.id AND f.friend_id = ?)
       )
       WHERE f.status = 'accepted' 
       AND (u.username LIKE ? OR u.fullname LIKE ?)
       LIMIT 20`,
      [user_id, user_id, searchTerm, searchTerm]
    );

    res.json(results);
  } catch (err) {
    console.error('❌ Search Friends Error:', err.message);
    res.status(500).json({ message: 'Lỗi server!', error: err.message });
  }
});

module.exports = router;
