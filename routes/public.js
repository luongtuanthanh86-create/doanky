const router = require('express').Router();
const pool = require('../config/database');
const {
  requestErrors,
  clean,
  normalizePhone,
  validId,
  phone,
  fail,
} = require('../lib/helpers');
const { detailSql, getRequest } = require('../lib/requests');
const { rateLimit } = require('../middleware/security');
const activeTypes = async () =>
  (
    await pool.query(
      "SELECT * FROM LoaiSuCo WHERE TrangThai='HoatDong' ORDER BY MaLoai",
    )
  )[0];
router.get('/', async (req, res) =>
  res.render('index', { title: 'Yêu cầu cứu hộ', types: await activeTypes() }),
);
router.post('/requests', rateLimit(20, 600000), async (req, res) => {
  const errors = requestErrors(req.body);
  const types = await activeTypes();
  if (!types.some((type) => type.MaLoai === Number(req.body.MaLoai)))
    errors.push('Loại sự cố không tồn tại hoặc đã bị khóa.');
  if (errors.length)
    return res.status(422).render('index', {
      title: 'Yêu cầu cứu hộ',
      errors,
      values: req.body,
      types,
    });
  const b = req.body;
  // INSERT ... SELECT kiểm tra loại sự cố còn hoạt động ngay lúc ghi dữ liệu.
  const [result] = await pool.execute(
    `INSERT INTO YeuCauCuuHo
    (HoTen, SoDienThoai, LoaiXe, BienSo, MaLoai, MoTa, ViDo, KinhDo, TrangThai, MaNhanVien, ThoiGianGui, ThoiGianCapNhat)
    SELECT ?,?,?,?,MaLoai,?,?,?,'ChoTiepNhan',NULL,NOW(),NOW() FROM LoaiSuCo WHERE MaLoai=? AND TrangThai='HoatDong'`,
    [
      clean(b.HoTen),
      normalizePhone(b.SoDienThoai),
      b.LoaiXe,
      clean(b.BienSo),
      clean(b.MoTa),
      Number(b.ViDo),
      Number(b.KinhDo),
      Number(b.MaLoai),
    ],
  );
  if (!result.affectedRows)
    return fail(
      res,
      409,
      'Loại sự cố vừa bị khóa. Vui lòng tải lại trang và chọn loại khác.',
    );
  req.session.lastRequestId = result.insertId;
  res.redirect(303, '/success');
});
router.get('/success', async (req, res) => {
  if (!req.session.lastRequestId) return res.redirect('/tracking');
  const request = await getRequest(req.session.lastRequestId);
  if (!request) return fail(res, 404, 'Không tìm thấy yêu cầu.');
  res.render('success', { title: 'Đã gửi yêu cầu', request });
});
router.get('/tracking', (req, res) =>
  res.render('tracking', {
    title: 'Tra cứu yêu cầu',
    request: null,
    requests: [],
    searched: false,
  }),
);
router.post('/tracking', rateLimit(40, 600000), async (req, res) => {
  const errors = [];
  // Mã chỉ dùng khi bấm chọn một kết quả, người dùng không cần nhập mã.
  if (req.body.MaYeuCau && !validId(req.body.MaYeuCau))
    errors.push('Yêu cầu được chọn không hợp lệ.');
  if (!phone(clean(req.body.SoDienThoai)))
    errors.push('Vui lòng nhập số điện thoại hợp lệ.');
  let request = null;
  let requests = [];
  if (!errors.length) {
    const [rows] = await pool.execute(
      detailSql + ' WHERE y.SoDienThoai=? ORDER BY y.MaYeuCau DESC',
      [normalizePhone(req.body.SoDienThoai)],
    );
    requests = rows;
    // Chỉ chọn từ các yêu cầu thuộc đúng SĐT vừa tra cứu.
    request = req.body.MaYeuCau
      ? rows.find((row) => row.MaYeuCau === Number(req.body.MaYeuCau)) || null
      : rows[0] || null;
  }
  res.status(errors.length ? 422 : 200).render('tracking', {
    title: 'Tra cứu yêu cầu',
    request,
    requests,
    searched: !errors.length,
    errors,
    values: req.body,
  });
});
module.exports = router;
