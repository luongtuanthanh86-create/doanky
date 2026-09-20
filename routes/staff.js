const router = require('express').Router();
const pool = require('../config/database');
const { requireLogin, requireStaff } = require('../middleware/auth');
const { dashboard, listRequests, getRequest } = require('../lib/requests');
const { validId, nextStatus, fail, flash } = require('../lib/helpers');
router.use(requireLogin, requireStaff);
router.param('id', (req, res, next, id) =>
  validId(id) ? next() : fail(res, 400, 'Mã yêu cầu không hợp lệ.'),
);
router.get('/dashboard', async (req, res) =>
  res.render('staff/dashboard', {
    title: 'Tổng quan cứu hộ',
    counts: await dashboard(),
  }),
);
router.get('/requests', async (req, res) =>
  res.render('staff/requests', {
    title: 'Yêu cầu cứu hộ',
    ...(await listRequests(req.query, false)),
    filters: req.query,
  }),
);
router.get('/requests/:id', async (req, res) => {
  const request = await getRequest(req.params.id);
  if (!request) return fail(res, 404, 'Không tìm thấy yêu cầu.');
  res.render('staff/request-detail', {
    title: `Yêu cầu #${request.MaYeuCau}`,
    request,
  });
});
router.post('/requests/:id/accept', async (req, res) => {
  // UPDATE nguyên tử: khi hai người nhận đồng thời, chỉ một UPDATE có affectedRows = 1.
  const [result] = await pool.execute(
    `UPDATE YeuCauCuuHo SET MaNhanVien=?, TrangThai='DaTiepNhan', ThoiGianCapNhat=NOW()
    WHERE MaYeuCau=? AND TrangThai='ChoTiepNhan' AND MaNhanVien IS NULL`,
    [req.session.user.id, req.params.id],
  );
  if (!result.affectedRows)
    return fail(
      res,
      409,
      'Yêu cầu đã được người khác tiếp nhận hoặc không còn tồn tại. Vui lòng tải lại danh sách.',
    );
  flash(req, 'Bạn đã tiếp nhận yêu cầu thành công.');
  res.redirect(303, `/staff/requests/${req.params.id}`);
});
router.post('/requests/:id/status', async (req, res) => {
  const target = req.body.status;
  const previous = Object.keys(nextStatus).find(
    (key) => nextStatus[key] === target,
  );
  if (!previous) return fail(res, 400, 'Trạng thái cập nhật không hợp lệ.');
  // Kiểm tra đồng thời người phụ trách và trạng thái trước đó ngay trong SQL.
  const [result] = await pool.execute(
    `UPDATE YeuCauCuuHo SET TrangThai=?, ThoiGianCapNhat=NOW()
    WHERE MaYeuCau=? AND MaNhanVien=? AND TrangThai=?`,
    [target, req.params.id, req.session.user.id, previous],
  );
  if (!result.affectedRows)
    return fail(
      res,
      409,
      'Bạn không phụ trách yêu cầu này hoặc trạng thái đã thay đổi. Không thể bỏ qua bước xử lý.',
    );
  flash(req, 'Đã cập nhật trạng thái yêu cầu.');
  res.redirect(303, `/staff/requests/${req.params.id}`);
});
module.exports = router;
