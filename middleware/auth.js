const pool = require('../config/database');
const { fail } = require('../lib/helpers');
async function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  // Đọc lại tài khoản mỗi lần truy cập: khóa tài khoản có hiệu lực với cả phiên cũ.
  const [rows] = await pool.execute(
    'SELECT MaTaiKhoan, TenDangNhap, HoTen, VaiTro, TrangThai FROM TaiKhoan WHERE MaTaiKhoan = ?',
    [req.session.user.id],
  );
  const account = rows[0];
  if (!account || account.TrangThai !== 'HoatDong') {
    return req.session.destroy((err) =>
      err ? next(err) : res.redirect('/login?locked=1'),
    );
  }
  req.session.user = {
    id: account.MaTaiKhoan,
    username: account.TenDangNhap,
    hoTen: account.HoTen,
    vaiTro: account.VaiTro,
  };
  res.locals.user = req.session.user;
  next();
}
function requireAdmin(req, res, next) {
  return req.session.user?.vaiTro === 'admin'
    ? next()
    : fail(res, 403, 'Bạn không có quyền truy cập trang quản trị.');
}
function requireStaff(req, res, next) {
  return req.session.user?.vaiTro === 'nhanvien'
    ? next()
    : fail(res, 403, 'Trang này dành cho nhân viên cứu hộ.');
}
module.exports = { requireLogin, requireAdmin, requireStaff };
