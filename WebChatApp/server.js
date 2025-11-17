require('dotenv').config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);

// =============================
// DEBUG ENV
// =============================
console.log("🔑 JWT_SECRET:", process.env.JWT_SECRET || "⚠️ Not using JWT");

// =============================
// MIDDLEWARE
// =============================

// ⚡ FIX LỖI 413 — TĂNG GIỚI HẠN PAYLOAD
app.use(cors());
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// Serve giao diện
app.use(express.static(path.join(__dirname, "public")));

// Trang mặc định → login
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// =============================
// ROUTES API
// =============================
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
