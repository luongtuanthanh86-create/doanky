require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
async function seed() {
  const users = [
    ['admin', 'Admin@123', 'Quản trị viên', '0900000001', 'admin'],
    ['nhanvien1', 'NhanVien@123', 'Nguyễn Minh An', '0900000002', 'nhanvien'],
    ['nhanvien2', 'NhanVien@123', 'Trần Hoàng Nam', '0900000003', 'nhanvien'],
  ];
  for (const [username, password, name, phone, role] of users) {
    const [existing] = await pool.execute(
      'SELECT MaTaiKhoan FROM TaiKhoan WHERE TenDangNhap=?',
      [username],
    );
    if (existing.length) {
      console.log(`Bỏ qua tài khoản đã tồn tại: ${username}`);
      continue;
    }
    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      'INSERT INTO TaiKhoan (TenDangNhap,MatKhau,HoTen,SoDienThoai,VaiTro) VALUES (?,?,?,?,?)',
      [username, hash, name, phone, role],
    );
    console.log(`Đã tạo: ${username}`);
  }
}
seed()
  .catch((err) => {
    console.error('Không tạo được tài khoản:', err.code || err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
