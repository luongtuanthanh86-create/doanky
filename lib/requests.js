const pool = require('../config/database');
const { statuses, validId } = require('./helpers');
const detailSql = `SELECT y.*, l.TenLoai, t.HoTen AS TenNhanVien
 FROM YeuCauCuuHo y JOIN LoaiSuCo l ON l.MaLoai=y.MaLoai
 LEFT JOIN TaiKhoan t ON t.MaTaiKhoan=y.MaNhanVien`;
async function getRequest(id) {
  const [rows] = await pool.execute(detailSql + ' WHERE y.MaYeuCau=?', [id]);
  return rows[0];
}
async function listRequests(query, isAdmin) {
  const clauses = [],
    params = [];
  if (query.status && Object.hasOwn(statuses, query.status)) {
    clauses.push('y.TrangThai=?');
    params.push(query.status);
  }
  if (isAdmin && query.search) {
    clauses.push('(y.MaYeuCau=? OR y.SoDienThoai=?)');
    params.push(validId(query.search) ? Number(query.search) : 0, query.search);
  }
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const [[{ total }]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM YeuCauCuuHo y' + where,
    params,
  );
  const pages = Math.max(1, Math.ceil(total / 20));
  const page = Math.min(pages, Math.max(1, parseInt(query.page, 10) || 1));
  const [rows] = await pool.execute(
    detailSql +
      where +
      ` ORDER BY y.MaYeuCau DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
    params,
  );
  return { rows, page, pages, total };
}
async function dashboard() {
  const [rows] = await pool.query(
    'SELECT TrangThai, COUNT(*) AS count FROM YeuCauCuuHo GROUP BY TrangThai',
  );
  const counts = Object.fromEntries(
    Object.keys(statuses).map((key) => [key, 0]),
  );
  for (const row of rows) counts[row.TrangThai] = row.count;
  return counts;
}
module.exports = { getRequest, listRequests, dashboard, detailSql };
