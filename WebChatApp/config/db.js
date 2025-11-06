const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123456',
  database: 'webchat_db'
});

db.connect(err => {
  if (err) throw err;
  console.log('✅ Connected to MySQL');
});

module.exports = db;
