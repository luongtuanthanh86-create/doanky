const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { clean } = require('../lib/helpers');
const { rateLimit } = require('../middleware/security');
router.get('/login', (req, res) =>
  res.render('login', {
    title: 'Đăng nhập',
    errors: req.query.locked
      ? ['Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.']
      : [],
  }),
);
router.post('/login', rateLimit(15, 600000), async (req, res, next) => {
  const username = clean(req.body.username);
  const password =
    typeof req.body.password === 'string' ? req.body.password : '';
  let error = 'Tên đăng nhập hoặc mật khẩu không đúng.';
  if (
    /^[a-zA-Z0-9_.]{3,50}$/.test(username) &&
    password.length &&
    Buffer.byteLength(password) <= 72
  ) {
    const [rows] = await pool.execute(
      'SELECT * FROM TaiKhoan WHERE TenDangNhap=?',
      [username],
    );
    const account = rows[0];
    if (account && (await bcrypt.compare(password, account.MatKhau))) {
      if (account.TrangThai === 'Khoa')
        error = 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.';
      else
        return req.session.regenerate((err) => {
          if (err) return next(err);
          req.session.user = {
            id: account.MaTaiKhoan,
            username: account.TenDangNhap,
            hoTen: account.HoTen,
            vaiTro: account.VaiTro,
          };
          req.session.save((err) =>
            err
              ? next(err)
              : res.redirect(
                  303,
                  account.VaiTro === 'admin'
                    ? '/admin/dashboard'
                    : '/staff/dashboard',
                ),
          );
        });
    }
  }
  res
    .status(401)
    .render('login', {
      title: 'Đăng nhập',
      errors: [error],
      values: { username },
    });
});
router.post('/logout', (req, res, next) =>
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('cuuho.sid');
    res.redirect(303, '/login');
  }),
);
module.exports = router;
