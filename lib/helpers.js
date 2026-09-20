const statuses = {
  ChoTiepNhan: 'Chờ tiếp nhận',
  DaTiepNhan: 'Đã tiếp nhận',
  DangXuLy: 'Đang xử lý',
  HoanThanh: 'Hoàn thành',
};
const vehicles = ['Xe máy', 'Ô tô', 'Xe tải', 'Xe khách', 'Phương tiện khác'];
const nextStatus = { DaTiepNhan: 'DangXuLy', DangXuLy: 'HoanThanh' };
const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const validId = (value) =>
  /^\d{1,10}$/.test(String(value)) &&
  Number(value) > 0 &&
  Number(value) <= 2147483647;
const phone = (value) => /^(0\d{9}|\+84\d{9})$/.test(value);
const normalizePhone = (value) => clean(value).replace(/^\+84/, '0');
function coordinate(value, min, max) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    /^-?\d+(\.\d+)?$/.test(value.trim()) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= min &&
    Number(value) <= max
  );
}
function requestErrors(body) {
  const errors = [];
  if (!clean(body.HoTen) || clean(body.HoTen).length > 100)
    errors.push('Họ tên phải có từ 1 đến 100 ký tự.');
  if (!phone(clean(body.SoDienThoai)))
    errors.push(
      'Số điện thoại gồm 10 chữ số bắt đầu bằng 0 hoặc +84 và 9 chữ số.',
    );
  if (!vehicles.includes(body.LoaiXe))
    errors.push('Vui lòng chọn loại phương tiện hợp lệ.');
  if (!validId(body.MaLoai)) errors.push('Vui lòng chọn loại sự cố hợp lệ.');
  if (clean(body.BienSo).length > 20) errors.push('Biển số tối đa 20 ký tự.');
  if (clean(body.MoTa).length > 2000) errors.push('Mô tả tối đa 2.000 ký tự.');
  if (!coordinate(body.ViDo, -90, 90) || !coordinate(body.KinhDo, -180, 180))
    errors.push('Vui lòng xác định vị trí hợp lệ trên bản đồ.');
  return errors;
}
function fail(res, status, message) {
  return res.status(status).render('error', { title: 'Thông báo', message });
}
function flash(req, message) {
  req.session.flash = message;
}
function formatDate(value) {
  if (!value) return '—';
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/,
  );
  return match
    ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}`
    : String(value);
}
module.exports = {
  statuses,
  vehicles,
  nextStatus,
  clean,
  validId,
  phone,
  normalizePhone,
  coordinate,
  requestErrors,
  fail,
  flash,
  formatDate,
};
