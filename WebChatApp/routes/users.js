// routes/users.js
const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Lấy thông tin một user theo ID
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.promise().query(
      "SELECT * FROM users WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.json({ success: false, message: "Không tìm thấy user!" });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
});

// Cập nhật user
router.put("/update", async (req, res) => {
  const { id, fullname, email, gender, birthday, bio, avatar } = req.body;

  if (!id) {
    return res.json({ success: false, message: "Thiếu user_id!" });
  }

  try {
    await db.promise().query(
      `UPDATE users
       SET fullname = ?, email = ?, gender = ?, birthday = ?, bio = ?, avatar = ?
       WHERE id = ?`,
      [fullname, email, gender, birthday, bio, avatar, id]
    );

    return res.json({ success: true, message: "Cập nhật thành công!" });
  } catch (err) {
    return res.json({ success: false, message: err.message });
  }
});

// 👇 CỰC QUAN TRỌNG: export đúng 1 cái router
module.exports = router;
