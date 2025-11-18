const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123456',   // mật khẩu MySQL của bạn
  database: 'webchat_db'
});

db.connect(err => {
  if (err) {
    console.error('❌ MySQL connection error:', err);
    throw err;
  }
  console.log('✅ Connected to MySQL');
});

module.exports = db;
