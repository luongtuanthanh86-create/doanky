require('dotenv').config();
const mysql = require('mysql2/promise');

// Pool tái sử dụng kết nối. Tất cả dữ liệu đầu vào được truyền qua dấu ?.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cuuho_giaothong',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 50,
  charset: 'utf8mb4',
  dateStrings: true,
  decimalNumbers: true,
});
module.exports = pool;
