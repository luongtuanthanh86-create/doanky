const router = require("express").Router();
const pool = require("../config/database");
const { valid } = require("../public/js/nearest-station");
const { phone, normalizePhone } = require("../lib/helpers");
router.param("id", (req, res, next, id) =>
  /^\d{1,10}$/.test(id)
    ? next()
    : res.status(400).send("Mã điểm không hợp lệ."),
);
async function page(res, values = {}, errors = [], status = 200) {
  const [stations] = await pool.query(
    "SELECT * FROM DiemCuuHo ORDER BY isDemo,id",
  );
  const [members] = await pool.query(
    "SELECT m.*,a.HoTen name,a.TenDangNhap username,s.name stationName FROM NhanVienTram m JOIN TaiKhoan a ON a.MaTaiKhoan=m.accountId JOIN DiemCuuHo s ON s.id=m.stationId",
  );
  const [accounts] = await pool.query(
    "SELECT MaTaiKhoan id,HoTen name,TenDangNhap username FROM TaiKhoan WHERE VaiTro='nhanvien' AND TrangThai='HoatDong'",
  );
  const [vehicles] = await pool.query(
    "SELECT v.*,s.name stationName FROM XeCuuHoTram v JOIN DiemCuuHo s ON s.id=v.stationId",
  );
  return res
    .status(status)
    .render("admin/stations", {
      title: "Trạm cứu hộ",
      stations,
      values,
      errors,
      members,
      accounts,
      vehicles,
    });
}
router.get("/", async (req, res) => page(res));
router.get("/:id/edit", async (req, res) => {
  const [[row]] = await pool.execute("SELECT * FROM DiemCuuHo WHERE id=?", [
    req.params.id,
  ]);
  if (!row) return page(res, {}, ["Không tìm thấy điểm cứu hộ."], 404);
  return page(res, row);
});
async function save(req, res) {
  const b = req.body,
    errors = [];
  const values = {
    id: req.params.id,
    name: typeof b.name === "string" ? b.name.trim() : "",
    address: typeof b.address === "string" ? b.address.trim() : "",
    phone: typeof b.phone === "string" ? b.phone.trim() : "",
    lat: b.lat,
    lng: b.lng,
    active: b.active === "1" ? 1 : 0,
    isDemo: b.isDemo === "1" ? 1 : 0,
  };
  if (!values.name || values.name.length > 150)
    errors.push("Nhập tên điểm tối đa 150 ký tự.");
  if (!values.address || values.address.length > 500)
    errors.push("Nhập địa chỉ tối đa 500 ký tự.");
  if (!valid(values.lat, values.lng))
    errors.push(
      "Tọa độ phải là số hợp lệ: vĩ độ -90 đến 90, kinh độ -180 đến 180.",
    );
  if (values.phone && !phone(values.phone))
    errors.push("Số điện thoại không hợp lệ.");
  if (errors.length) return page(res, values, errors, 422);
  const args = [
    values.name,
    values.address,
    normalizePhone(values.phone),
    Number(values.lat),
    Number(values.lng),
    values.active,
    values.isDemo,
  ];
  if (req.params.id) {
    const [r] = await pool.execute(
      "UPDATE DiemCuuHo SET name=?,address=?,phone=?,lat=?,lng=?,active=?,isDemo=? WHERE id=?",
      [...args, req.params.id],
    );
    if (!r.affectedRows)
      return page(res, values, ["Không tìm thấy điểm cứu hộ."], 404);
  } else
    await pool.execute(
      "INSERT INTO DiemCuuHo(name,address,phone,lat,lng,active,isDemo) VALUES(?,?,?,?,?,?,?)",
      args,
    );
  res.redirect(303, "/admin/stations");
}
router.post("/save", save);
router.post("/:id/save", save);
router.post("/demo", async (req, res) => {
  const points = [
    [
      "phapvan",
      "MẪU – Cứu hộ Pháp Vân",
      "Vị trí minh họa khu vực Pháp Vân, không phải cơ sở thực",
      20.968,
      105.841,
    ],
    [
      "hoalac",
      "MẪU – Cứu hộ Hòa Lạc",
      "Vị trí minh họa khu vực Hòa Lạc, không phải cơ sở thực",
      21.005,
      105.526,
    ],
    [
      "hanoihaiphong",
      "MẪU – Cứu hộ Hà Nội–Hải Phòng",
      "Vị trí minh họa khu vực đầu tuyến Hà Nội–Hải Phòng, không phải cơ sở thực",
      20.973,
      105.945,
    ],
    [
      "trungvan",
      "MẪU – Cứu hộ CT3 Trung Văn",
      "Vị trí minh họa gần CT3 Trung Văn, không phải cơ sở thực",
      20.996,
      105.793,
    ],
    [
      "vinhtuy",
      "MẪU – Cứu hộ cầu Vĩnh Tuy",
      "Vị trí minh họa gần cầu Vĩnh Tuy, không phải cơ sở thực",
      21.0,
      105.891,
    ],
  ];
  for (const [key, name, address, lat, lng] of points)
    await pool.execute(
      "INSERT IGNORE INTO DiemCuuHo(demoKey,name,address,lat,lng,isDemo) VALUES(?,?,?,?,?,1)",
      [key, name, address, lat, lng],
    );
  res.redirect(303, "/admin/stations");
});
router.post("/member", async (req, res) => {
  const accountId = Number(req.body.accountId) || 0,
    stationId = Number(req.body.stationId) || 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[account]] = await conn.execute(
      "SELECT MaTaiKhoan FROM TaiKhoan WHERE MaTaiKhoan=? AND VaiTro='nhanvien' AND TrangThai='HoatDong' FOR UPDATE",
      [accountId],
    );
    const [[busy]] = await conn.execute(
      "SELECT COUNT(*) n FROM HoTroNhanh WHERE technician=? AND state IN ('proposed','accepted','enroute','helping')",
      [accountId],
    );
    if (!account || busy.n) {
      await conn.rollback();
      return page(
        res,
        {},
        ["Tài khoản không hợp lệ hoặc đang thực hiện cứu hộ."],
        422,
      );
    }
    const [[station]] = await conn.execute(
      "SELECT id FROM DiemCuuHo WHERE id=?",
      [stationId],
    );
    if (stationId && !station) {
      await conn.rollback();
      return page(res, {}, ["Trạm không hợp lệ."], 422);
    }
    if (stationId)
      await conn.execute(
        "INSERT INTO NhanVienTram(accountId,stationId,manager) VALUES(?,?,?) ON DUPLICATE KEY UPDATE stationId=VALUES(stationId),manager=VALUES(manager)",
        [accountId, stationId, req.body.manager === "1" ? 1 : 0],
      );
    else
      await conn.execute("DELETE FROM NhanVienTram WHERE accountId=?", [
        accountId,
      ]);
    await conn.commit();
    res.redirect(303, "/admin/stations");
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
});
router.post("/vehicle", async (req, res) => {
  const stationId = Number(req.body.stationId) || 0,
    name = String(req.body.name || "").trim(),
    plate = String(req.body.plate || "").trim(),
    capability = String(req.body.capability || "").trim();
  const [[station]] = await pool.execute(
    "SELECT id FROM DiemCuuHo WHERE id=?",
    [stationId],
  );
  if (
    !station ||
    !name ||
    name.length > 150 ||
    !plate ||
    plate.length > 30 ||
    capability.length > 150
  )
    return page(res, {}, ["Nhập đúng trạm, tên xe, biển số và khả năng."], 422);
  try {
    await pool.execute(
      "INSERT INTO XeCuuHoTram(stationId,name,plate,capability) VALUES(?,?,?,?)",
      [stationId, name, plate, capability],
    );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY")
      return page(res, {}, ["Biển số đã có trong danh sách."], 422);
    throw e;
  }
  res.redirect(303, "/admin/stations");
});
router.post("/vehicle/:id/toggle", async (req, res) => {
  await pool.execute("UPDATE XeCuuHoTram SET active=1-active WHERE id=?", [
    req.params.id,
  ]);
  res.redirect(303, "/admin/stations");
});
module.exports = router;
