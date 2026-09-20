const router = require('express').Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { requireLogin, requireAdmin } = require('../middleware/auth');
const { dashboard, listRequests, getRequest } = require('../lib/requests');
const {
  clean,
  phone,
  normalizePhone,
  validId,
  fail,
  flash,
} = require('../lib/helpers');
router.use(requireLogin, requireAdmin);
router.param('id', (req, res, next, id) =>
  validId(id) ? next() : fail(res, 400, 'ID không hợp lệ.'),
);
router.get('/dashboard', async (req, res) => {
  const [[{ staffCount }]] = await pool.query(
    "SELECT COUNT(*) AS staffCount FROM TaiKhoan WHERE VaiTro='nhanvien'",
  );
  const [[{ typeCount }]] = await pool.query(
    'SELECT COUNT(*) AS typeCount FROM LoaiSuCo',
  );
  res.render('admin/dashboard', {
    title: 'Tổng quan hệ thống',
    counts: await dashboard(),
    staffCount,
    typeCount,
  });
});
router.get('/requests', async (req, res) =>
  res.render('admin/requests', {
    title: 'Quản lý yêu cầu',
    ...(await listRequests(req.query, true)),
    filters: req.query,
  }),
);
router.get('/requests/:id', async (req, res) => {
  const request = await getRequest(req.params.id);
  if (!request) return fail(res, 404, 'Không tìm thấy yêu cầu.');
  res.render('admin/request-detail', {
    title: `Yêu cầu #${request.MaYeuCau}`,
    request,
  });
});
router.get('/users', async (req, res) => {
  const [accounts] = await pool.query(
    "SELECT MaTaiKhoan, HoTen, SoDienThoai, TenDangNhap, VaiTro, TrangThai FROM TaiKhoan WHERE VaiTro='nhanvien' ORDER BY MaTaiKhoan DESC",
  );
  res.render('admin/users', { title: 'Nhân viên cứu hộ', accounts });
});
router.get('/users/new', (req, res) =>
  res.render('admin/user-form', { title: 'Thêm nhân viên', editing: false }),
);
router.get('/users/:id/edit', async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT MaTaiKhoan, HoTen, SoDienThoai, TenDangNhap, VaiTro, TrangThai FROM TaiKhoan WHERE MaTaiKhoan=? AND VaiTro='nhanvien'",
    [req.params.id],
  );
  if (!rows[0]) return fail(res, 404, 'Không tìm thấy nhân viên.');
  res.render('admin/user-form', {
    title: 'Sửa nhân viên',
    editing: true,
    values: rows[0],
  });
});
async function saveUser(req, res) {
  const editing = Boolean(req.params.id),
    b = req.body,
    errors = [];
  const username = clean(b.TenDangNhap),
    password = typeof b.MatKhau === 'string' ? b.MatKhau : '';
  if (!clean(b.HoTen) || clean(b.HoTen).length > 100)
    errors.push('Họ tên phải có từ 1 đến 100 ký tự.');
  if (!phone(clean(b.SoDienThoai))) errors.push('Số điện thoại không hợp lệ.');
  if (!/^[A-Za-z0-9_.]{3,50}$/.test(username))
    errors.push(
      'Tên đăng nhập dài 3–50 ký tự, chỉ gồm chữ không dấu, số, dấu chấm hoặc gạch dưới.',
    );
  if (
    (!editing || password) &&
    (password.length < 8 || Buffer.byteLength(password) > 72)
  )
    errors.push('Mật khẩu tối thiểu 8 ký tự và tối đa 72 byte.');
  if (b.VaiTro !== 'nhanvien')
    errors.push('Chức năng này chỉ quản lý vai trò nhân viên.');
  if (!['HoatDong', 'Khoa'].includes(b.TrangThai))
    errors.push('Trạng thái tài khoản không hợp lệ.');
  if (editing) {
    const [rows] = await pool.execute(
      "SELECT MaTaiKhoan FROM TaiKhoan WHERE MaTaiKhoan=? AND VaiTro='nhanvien'",
      [req.params.id],
    );
    if (!rows[0]) return fail(res, 404, 'Không tìm thấy nhân viên.');
  }
  const renderErrors = () =>
    res
      .status(422)
      .render('admin/user-form', {
        title: editing ? 'Sửa nhân viên' : 'Thêm nhân viên',
        editing,
        values: { ...b, MatKhau: '', MaTaiKhoan: req.params.id },
        errors,
      });
  if (errors.length) return renderErrors();
  try {
    if (editing) {
      let sql =
        'UPDATE TaiKhoan SET HoTen=?, SoDienThoai=?, TenDangNhap=?, TrangThai=?';
      const params = [
        clean(b.HoTen),
        normalizePhone(b.SoDienThoai),
        username,
        b.TrangThai,
      ];
      if (password) {
        sql += ', MatKhau=?';
        params.push(await bcrypt.hash(password, 12));
      }
      sql += " WHERE MaTaiKhoan=? AND VaiTro='nhanvien'";
      params.push(req.params.id);
      await pool.execute(sql, params);
    } else {
      await pool.execute(
        'INSERT INTO TaiKhoan (HoTen,SoDienThoai,TenDangNhap,MatKhau,VaiTro,TrangThai) VALUES (?,?,?,?,?,?)',
        [
          clean(b.HoTen),
          normalizePhone(b.SoDienThoai),
          username,
          await bcrypt.hash(password, 12),
          'nhanvien',
          b.TrangThai,
        ],
      );
    }
  } catch (err) {
    if (err.code !== 'ER_DUP_ENTRY') throw err;
    errors.push('Tên đăng nhập đã tồn tại.');
    return renderErrors();
  }
  flash(req, 'Đã lưu thông tin nhân viên.');
  res.redirect(303, '/admin/users');
}
router.post('/users', saveUser);
router.post('/users/:id/edit', saveUser);
router.post('/users/:id/status', async (req, res) => {
  if (!['HoatDong', 'Khoa'].includes(req.body.status))
    return fail(res, 400, 'Trạng thái không hợp lệ.');
  const [result] = await pool.execute(
    "UPDATE TaiKhoan SET TrangThai=? WHERE MaTaiKhoan=? AND VaiTro='nhanvien'",
    [req.body.status, req.params.id],
  );
  if (!result.affectedRows) return fail(res, 404, 'Không tìm thấy nhân viên.');
  flash(req, 'Đã cập nhật trạng thái tài khoản.');
  res.redirect(303, '/admin/users');
});
router.get('/incident-types', async (req, res) => {
  const [types] = await pool.query('SELECT * FROM LoaiSuCo ORDER BY MaLoai');
  res.render('admin/incident-types', { title: 'Loại sự cố', types });
});
router.get('/incident-types/new', (req, res) =>
  res.render('admin/incident-type-form', {
    title: 'Thêm loại sự cố',
    editing: false,
  }),
);
router.get('/incident-types/:id/edit', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM LoaiSuCo WHERE MaLoai=?', [
    req.params.id,
  ]);
  if (!rows[0]) return fail(res, 404, 'Không tìm thấy loại sự cố.');
  res.render('admin/incident-type-form', {
    title: 'Sửa loại sự cố',
    editing: true,
    values: rows[0],
  });
});
async function saveType(req, res) {
  const editing = Boolean(req.params.id),
    b = req.body,
    errors = [];
  if (!clean(b.TenLoai) || clean(b.TenLoai).length > 100)
    errors.push('Tên loại sự cố phải có từ 1 đến 100 ký tự.');
  if (clean(b.MoTa).length > 255) errors.push('Mô tả tối đa 255 ký tự.');
  if (!['HoatDong', 'Khoa'].includes(b.TrangThai))
    errors.push('Trạng thái không hợp lệ.');
  if (errors.length)
    return res
      .status(422)
      .render('admin/incident-type-form', {
        title: editing ? 'Sửa loại sự cố' : 'Thêm loại sự cố',
        editing,
        values: { ...b, MaLoai: req.params.id },
        errors,
      });
  const params = [clean(b.TenLoai), clean(b.MoTa), b.TrangThai];
  if (editing) {
    const [result] = await pool.execute(
      'UPDATE LoaiSuCo SET TenLoai=?, MoTa=?, TrangThai=? WHERE MaLoai=?',
      [...params, req.params.id],
    );
    if (!result.affectedRows)
      return fail(res, 404, 'Không tìm thấy loại sự cố.');
  } else
    await pool.execute(
      'INSERT INTO LoaiSuCo (TenLoai,MoTa,TrangThai) VALUES (?,?,?)',
      params,
    );
  flash(req, 'Đã lưu loại sự cố.');
  res.redirect(303, '/admin/incident-types');
}
router.post('/incident-types', saveType);
router.post('/incident-types/:id/edit', saveType);
router.post('/incident-types/:id/status', async (req, res) => {
  if (!['HoatDong', 'Khoa'].includes(req.body.status))
    return fail(res, 400, 'Trạng thái không hợp lệ.');
  const [result] = await pool.execute(
    'UPDATE LoaiSuCo SET TrangThai=? WHERE MaLoai=?',
    [req.body.status, req.params.id],
  );
  if (!result.affectedRows) return fail(res, 404, 'Không tìm thấy loại sự cố.');
  flash(req, 'Đã cập nhật trạng thái loại sự cố.');
  res.redirect(303, '/admin/incident-types');
});
module.exports = router;
