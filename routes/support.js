const router = require("express").Router();
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const pool = require("../config/database");
const { phone, normalizePhone } = require("../lib/helpers");
const events = new EventEmitter();
events.setMaxListeners(0);
const terminal = ["complete", "cancelled"];
const labels = {
  waiting: "Chờ kết nối",
  connected: "Đang trao đổi",
  station_pending: "Chờ trạm tiếp nhận",
  station_ready: "Trạm đã nhận · đang chuẩn bị xe",
  proposed: "Chờ bạn xác nhận",
  accepted: "Đã đồng ý phương án",
  enroute: "Nhân viên đang đến",
  helping: "Đang hỗ trợ",
  complete: "Hoàn thành",
  cancelled: "Đã hủy",
};
const config = () => ({
  hotline: /^\+?\d{9,15}$/.test(process.env.RESCUE_HOTLINE || "")
    ? process.env.RESCUE_HOTLINE
    : "",
  area: process.env.RESCUE_AREA || "Liên hệ để xác nhận khu vực phục vụ",
  hours: process.env.RESCUE_HOURS || "Giờ trực chưa được công bố",
});
const bad = (message, status = 422) =>
  Object.assign(new Error(message), { status });
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
function guest(req) {
  if (!req.session.supportKey)
    req.session.supportKey = crypto.randomBytes(32).toString("hex");
  return crypto
    .createHash("sha256")
    .update(req.session.supportKey)
    .digest("hex");
}
async function account(req) {
  if (!req.session.user) return null;
  const [rows] = await pool.execute(
    "SELECT MaTaiKhoan id,HoTen name,VaiTro role,SoDienThoai phone,(SELECT stationId FROM NhanVienTram WHERE accountId=MaTaiKhoan) stationId,(SELECT manager FROM NhanVienTram WHERE accountId=MaTaiKhoan) stationManager FROM TaiKhoan WHERE MaTaiKhoan=? AND TrangThai='HoatDong'",
    [req.session.user.id],
  );
  return rows[0] || null;
}
async function staff(req, res, next) {
  try {
    req.actor = await account(req);
    if (!req.actor) {
      if (req.originalUrl.startsWith("/support/desk") && req.method === "GET")
        return res.redirect("/login");
      throw bad("Phiên nhân viên đã hết hạn. Vui lòng đăng nhập lại.", 401);
    }
    next();
  } catch (e) {
    next(e);
  }
}
const select = `SELECT h.*,d.HoTen dispatcherName,t.HoTen technicianName,t.SoDienThoai technicianPhone  ,s.name stationName,v.name rescueVehicleName,v.plate rescueVehiclePlate FROM HoTroNhanh h LEFT JOIN DiemCuuHo s ON s.id=h.stationId LEFT JOIN XeCuuHoTram v ON v.id=h.stationVehicleId LEFT JOIN TaiKhoan d ON d.MaTaiKhoan=h.dispatcher LEFT JOIN TaiKhoan t ON t.MaTaiKhoan=h.technician`;
async function accessible(req, conn = pool, lock = false) {
  if (!/^\d{1,10}$/.test(req.params.id))
    throw bad("Mã hỗ trợ không hợp lệ.", 404);
  const [rows] = await conn.execute(
    "SELECT * FROM HoTroNhanh WHERE id=?" + (lock ? " FOR UPDATE" : ""),
    [req.params.id],
  );
  const row = rows[0];
  if (!row || (!req.actor && row.guestHash !== guest(req)))
    throw bad("Không tìm thấy phiên hỗ trợ của bạn.", 404);
  if (
    req.actor?.stationId &&
    req.actor.role !== "admin" &&
    row.stationId !== req.actor.stationId
  )
    throw bad("Yêu cầu này chưa được giao cho trạm của bạn.", 403);
  return row;
}
function stationManager(req, row) {
  return (
    req.actor?.role === "admin" ||
    (req.actor?.stationId === row.stationId && req.actor?.stationManager === 1)
  );
}
function owner(req, row) {
  if (req.actor?.role !== "admin" && row.dispatcher !== req.actor?.id)
    throw bad("Chỉ người tiếp nhận mới được điều phối yêu cầu này.", 403);
}
async function system(conn, id, body) {
  await conn.execute(
    "INSERT INTO HoTroTinNhan (requestId,sender,author,body) VALUES (?,'system','Hệ thống',?)",
    [id, body],
  );
}
async function transaction(req, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const row = await accessible(req, conn, true);
    const result = await fn(conn, row);
    await conn.commit();
    events.emit("change", row.id);
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
const counts = new Map();
router.use((req, res, next) => {
  if (req.method !== "POST") return next();
  const now = Date.now();
  for (const [key, item] of counts) if (item.until < now) counts.delete(key);
  const key = req.ip;
  const entry = counts.get(key) || { n: 0, until: now + 60000 };
  counts.set(key, entry);
  if (++entry.n > 60)
    return next(
      bad("Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.", 429),
    );
  next();
});
router.get("/", (req, res) => {
  guest(req);
  res.render("support/home", {
    roomExpired: req.query.roomExpired === "1",
    title: "Kết nối cứu hộ",
    supportConfig: config(),
  });
});
router.get("/room/:id", async (req, res, next) => {
  try {
    await accessible(req);
    res.render("support/room", {
      title: "Phòng hỗ trợ",
      supportId: req.params.id,
      staffMode: false,
      supportConfig: config(),
    });
  } catch (e) {
    if (e.status === 404) return res.redirect("/?roomExpired=1");
    next(e);
  }
});
router.get("/desk", staff, (req, res) =>
  res.render("support/desk", {
    title: "Tiếp nhận & điều phối",
    supportConfig: config(),
  }),
);
router.get("/desk/:id", staff, async (req, res, next) => {
  try {
    await accessible(req);
    res.render("support/room", {
      title: "Xử lý hỗ trợ",
      supportId: req.params.id,
      staffMode: true,
      supportConfig: config(),
    });
  } catch (e) {
    next(e);
  }
});
router.post("/api/start", async (req, res, next) => {
  try {
    const hash = guest(req);
    const [r] = await pool.execute(
      "INSERT INTO HoTroNhanh (guestHash,activeGuest,routingMode) VALUES (?,?,'station') ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",
      [hash, hash],
    );
    await new Promise((resolve, reject) =>
      req.session.save((e) => (e ? reject(e) : resolve())),
    );
    events.emit("change", r.insertId);
    res.json({ id: r.insertId });
  } catch (e) {
    next(e);
  }
});
router.get("/api/desk", staff, async (req, res, next) => {
  try {
    const stationOnly = req.actor.stationId && req.actor.role !== "admin";
    const [requests] = await pool.execute(
      select +
        " WHERE (h.state NOT IN ('complete','cancelled') OR h.updatedAt>DATE_SUB(NOW(),INTERVAL 1 DAY))" +
        (stationOnly ? " AND h.stationId=?" : "") +
        " ORDER BY h.id DESC LIMIT 150",
      stationOnly ? [req.actor.stationId] : [],
    );
    const [team] = await pool.query(
      "SELECT a.MaTaiKhoan id,a.HoTen name,(SELECT stationId FROM NhanVienTram WHERE accountId=a.MaTaiKhoan) stationId,c.area,c.capability,COALESCE(c.available=1 AND (EXISTS(SELECT 1 FROM NhanVienTram m WHERE m.accountId=a.MaTaiKhoan) OR c.seenAt>DATE_SUB(NOW(),INTERVAL 60 SECOND)),0) available,(SELECT COUNT(*) FROM HoTroNhanh h WHERE h.technician=a.MaTaiKhoan AND h.state IN ('proposed','accepted','enroute','helping')) busy FROM TaiKhoan a LEFT JOIN CaTrucCuuHo c ON c.accountId=a.MaTaiKhoan WHERE a.TrangThai='HoatDong'",
    );
    const visibleRequests =
      req.actor.stationId && req.actor.role !== "admin"
        ? requests.filter((r) => r.stationId === req.actor.stationId)
        : requests;
    requests.forEach((r) => {
      delete r.guestHash;
      delete r.activeGuest;
      r.ringing = voice.ringing(r.id);
    });
    res.json({
      requests: visibleRequests,
      team:
        req.actor.stationId && req.actor.role !== "admin"
          ? team.filter((t) => t.stationId === req.actor.stationId)
          : team,
      actor: req.actor,
      labels,
    });
  } catch (e) {
    next(e);
  }
});
router.post("/api/duty", staff, async (req, res, next) => {
  try {
    await pool.execute(
      "INSERT INTO CaTrucCuuHo(accountId,available,area,capability) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE available=VALUES(available),area=VALUES(area),capability=VALUES(capability),seenAt=NOW()",
      [
        req.actor.id,
        req.body.available === true ? 1 : 0,
        text(req.body.area, 150),
        text(req.body.capability, 150),
      ],
    );
    events.emit("change", 0);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
router.post("/api/heartbeat", staff, async (req, res, next) => {
  try {
    await pool.execute(
      "UPDATE CaTrucCuuHo SET seenAt=NOW() WHERE accountId=?",
      [req.actor.id],
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
router.use("/api/staff", staff);
for (const prefix of ["/api/guest", "/api/staff"]) {
  router.get(prefix + "/:id", async (req, res, next) => {
    try {
      await accessible(req);
      const [[row]] = await pool.execute(select + " WHERE h.id=?", [
        req.params.id,
      ]);
      delete row.guestHash;
      delete row.activeGuest;
      const [messages] = await pool.execute(
        "SELECT id,sender,author,body,mime,createdAt FROM HoTroTinNhan WHERE requestId=? ORDER BY id DESC LIMIT 100",
        [row.id],
      );
      const [stations] = await pool.query(
        "SELECT id,name,address,phone,lat,lng,active,isDemo FROM DiemCuuHo WHERE active=1 ORDER BY id",
      );
      const [declined] = await pool.execute(
        "SELECT stationId,reason FROM HoTroTramTuChoi WHERE requestId=?",
        [row.id],
      );
      const [resources] = req.actor
        ? await pool.execute(
            "SELECT a.MaTaiKhoan id,a.HoTen name,m.stationId,m.manager,COALESCE(c.available,0) available,(SELECT COUNT(*) FROM HoTroNhanh h WHERE h.technician=a.MaTaiKhoan AND h.state IN ('proposed','accepted','enroute','helping')) busy FROM NhanVienTram m JOIN TaiKhoan a ON a.MaTaiKhoan=m.accountId LEFT JOIN CaTrucCuuHo c ON c.accountId=m.accountId WHERE m.stationId=? AND a.TrangThai='HoatDong'",
            [row.stationId || 0],
          )
        : [[]];
      const [vehicles] = req.actor
        ? await pool.execute(
            "SELECT v.*,(SELECT COUNT(*) FROM HoTroNhanh h WHERE h.stationVehicleId=v.id AND h.state IN ('proposed','accepted','enroute','helping')) busy FROM XeCuuHoTram v WHERE v.stationId=? AND v.active=1",
            [row.stationId || 0],
          )
        : [[]];
      res.json({
        resources,
        vehicles,
        declined,
        stations,
        nearestStation: require("../public/js/nearest-station").nearest(
          require("../public/js/nearest-station")
            .eligible(stations)
            .filter((s) => !declined.some((d) => d.stationId === s.id)),
          row.lat,
          row.lng,
        ),
        request: row,
        messages: messages.reverse(),
        labels,
        actor: req.actor || null,
      });
    } catch (e) {
      next(e);
    }
  });
  router.get(prefix + "/:id/media/:mediaId", async (req, res, next) => {
    try {
      await accessible(req);
      const [[file]] = await pool.execute(
        "SELECT mime,media FROM HoTroTinNhan WHERE id=? AND requestId=?",
        [req.params.mediaId, req.params.id],
      );
      if (!file?.media) throw bad("Không tìm thấy tệp.", 404);
      res.set("Content-Security-Policy", "default-src 'none'; sandbox");
      res.type(file.mime).send(file.media);
    } catch (e) {
      next(e);
    }
  });
  router.post(prefix + "/:id/message", async (req, res, next) => {
    try {
      await transaction(req, async (conn, row) => {
        if (terminal.includes(row.state))
          throw bad("Phiên hỗ trợ đã kết thúc.", 409);
        if (
          req.actor &&
          req.actor.role !== "admin" &&
          ![row.dispatcher, row.technician].includes(req.actor.id) &&
          !stationManager(req, row)
        )
          throw bad("Hãy tiếp nhận yêu cầu trước khi trao đổi.", 403);
        const body = text(req.body.text, 2000);
        let data = null,
          mime = null;
        if (req.body.media) {
          if (
            typeof req.body.media !== "string" ||
            req.body.media.length > 710000
          )
            throw bad("Tệp tối đa 512 KB.");
          data = Buffer.from(req.body.media, "base64");
          if (data.length > 512 * 1024 || data.length < 12)
            throw bad("Tệp không hợp lệ hoặc vượt 512 KB.");
          const hex = data.subarray(0, 8).toString("hex");
          if (hex === "89504e470d0a1a0a") mime = "image/png";
          else if (hex.startsWith("ffd8ff")) mime = "image/jpeg";
          else if (
            data.toString("ascii", 0, 4) === "RIFF" &&
            data.toString("ascii", 8, 12) === "WEBP"
          )
            mime = "image/webp";
          else if (hex.startsWith("1a45dfa3")) mime = "audio/webm";
          else if (data.toString("ascii", 0, 4) === "OggS") mime = "audio/ogg";
          else if (data.toString("ascii", 4, 8) === "ftyp") mime = "audio/mp4";
          else throw bad("Chỉ nhận ảnh PNG/JPEG/WebP và ghi âm WebM/OGG/M4A.");
        }
        if (!body && !data) throw bad("Nhập tin nhắn hoặc chọn ảnh/ghi âm.");
        const [[count]] = await conn.execute(
          "SELECT COUNT(*) n FROM HoTroTinNhan WHERE requestId=?",
          [row.id],
        );
        if (count.n >= 500)
          throw bad(
            "Phiên đã đạt giới hạn tin nhắn. Vui lòng gọi trực tiếp.",
            429,
          );
        await conn.execute(
          "INSERT INTO HoTroTinNhan(requestId,sender,author,body,mime,media) VALUES(?,?,?,?,?,?)",
          [
            row.id,
            req.actor ? "staff" : "guest",
            req.actor?.name || "Khách cần hỗ trợ",
            body,
            mime,
            data,
          ],
        );
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  if (prefix === "/api/guest") router.post(prefix + "/:id/location", async (req, res, next) => {
    try {
      const result = await transaction(req, async (conn, row) => {
        if (terminal.includes(row.state)) throw bad("Yêu cầu đã kết thúc.", 409);
        // Preserve the destination once a station has been dispatched.
        if (row.stationId || !["waiting", "connected"].includes(row.state))
          return { kept: true, lat: row.lat, lng: row.lng };
        const { lat, lng } = req.body;
        if (typeof lat !== "number" || typeof lng !== "number" ||
            !Number.isFinite(lat) || !Number.isFinite(lng) ||
            Math.abs(lat) > 90 || Math.abs(lng) > 180)
          throw bad("Tọa độ không hợp lệ.");
        await conn.execute("UPDATE HoTroNhanh SET lat=?,lng=?,updatedAt=NOW() WHERE id=?", [lat, lng, row.id]);
        await system(conn, row.id, "Khách đã tự động gửi vị trí khi bấm gọi thoại.");
        return { kept: false, lat, lng };
      });
      res.json({ ok: true, ...result });
    } catch (e) { next(e); }
  });
  router.post(prefix + "/:id/details", async (req, res, next) => {
    try {
      await transaction(req, async (conn, row) => {
        if (
          ![
            "waiting",
            "connected",
            "station_pending",
            "station_ready",
          ].includes(row.state)
        )
          throw bad(
            "Vị trí và sự cố đã chốt. Hãy yêu cầu điều chỉnh phương án trước.",
            409,
          );
        if (req.actor && !stationManager(req, row)) owner(req, row);
        const b = req.body;
        const lat =
            row.stationId && b.lat == null
              ? row.lat
              : b.lat === "" || b.lat == null
                ? null
                : Number(b.lat),
          lng =
            row.stationId && b.lng == null
              ? row.lng
              : b.lng === "" || b.lng == null
                ? null
                : Number(b.lng);
        if (row.stationId && (lat !== row.lat || lng !== row.lng))
          throw bad("Vị trí đã giao trạm. Liên hệ điều phối để giao lại.", 409);
        if (
          (lat === null) !== (lng === null) ||
          (lat !== null &&
            (!Number.isFinite(lat) ||
              !Number.isFinite(lng) ||
              Math.abs(lat) > 90 ||
              Math.abs(lng) > 180))
        )
          throw bad("Tọa độ không hợp lệ.");
        if (b.phone && !phone(text(b.phone, 40)))
          throw bad("Số điện thoại chưa đúng định dạng.");
        await conn.execute(
          "UPDATE HoTroNhanh SET lat=?,lng=?,locationText=?,phone=?,vehicle=?,issue=?,updatedAt=NOW() WHERE id=?",
          [
            lat,
            lng,
            text(b.locationText, 500),
            normalizePhone(b.phone),
            text(b.vehicle, 40),
            text(b.issue, 500),
            row.id,
          ],
        );
        await system(conn, row.id, "Đã cập nhật vị trí/thông tin sự cố.");
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  router.post(prefix + "/:id/action", async (req, res, next) => {
    try {
      await transaction(req, async (conn, row) => {
        const action = req.body.action;
        let target;
        if (req.actor) {
          if (action === "station_accept" || action === "station_decline") {
            if (!stationManager(req, row))
              throw bad("Chỉ phụ trách trạm được tiếp nhận hoặc từ chối.", 403);
            if (action === "station_accept" ? row.state !== "station_pending" : !["station_pending","station_ready"].includes(row.state))
              throw bad("Trạm đã xử lý yêu cầu này.", 409);
            if (action === "station_decline") {
              const reason = text(req.body.reason, 500);
              if (!reason) throw bad("Nhập lý do trạm không thể phục vụ.");
              await conn.execute(
                "INSERT INTO HoTroTramTuChoi(requestId,stationId,reason) VALUES(?,?,?) ON DUPLICATE KEY UPDATE reason=VALUES(reason)",
                [row.id, row.stationId, reason],
              );
              await conn.execute(
                "UPDATE HoTroNhanh SET stationId=NULL,state='connected',updatedAt=NOW() WHERE id=?",
                [row.id],
              );
              await system(
                conn,
                row.id,
                "Trạm từ chối: " +
                  reason +
                  ". Điều phối viên đang tìm trạm khác.",
              );
            } else {
              await conn.execute(
                "UPDATE HoTroNhanh SET state='station_ready',updatedAt=NOW() WHERE id=?",
                [row.id],
              );
              await system(
                conn,
                row.id,
                "Trạm đã tiếp nhận, đang chọn xe và nhân viên thuộc trạm.",
              );
            }
            return;
          }
          if (action === "claim") {
            if (req.actor.stationId && req.actor.role !== "admin")
              throw bad(
                "Nhân viên trạm chỉ nhận yêu cầu do điều phối giao.",
                403,
              );
            if (row.state !== "waiting" || row.dispatcher)
              throw bad("Yêu cầu đã có người tiếp nhận.", 409);
            await conn.execute(
              "UPDATE HoTroNhanh SET dispatcher=?,state='connected',updatedAt=NOW() WHERE id=?",
              [req.actor.id, row.id],
            );
            await system(
              conn,
              row.id,
              req.actor.name + " đã tiếp nhận và đang trao đổi với bạn.",
            );
            return;
          }
          if (["enroute", "helping", "complete"].includes(action)) {
            if (!stationManager(req, row) && req.actor.id !== row.technician)
              throw bad(
                "Chỉ nhân viên được điều phối hoặc phụ trách trạm được giao mới được cập nhật hành trình.",
                403,
              );
            const previous = {
              enroute: "accepted",
              helping: "enroute",
              complete: "helping",
            };
            if (row.state !== previous[action])
              throw bad(
                "Cần xác nhận phương án và thực hiện đúng thứ tự.",
                409,
              );
            target = action;
          } else {
            if (!(action === "revise" && stationManager(req, row)))
              owner(req, row);
            if (action === "revise" && row.state === "proposed")
              target = row.stationId ? "station_ready" : "connected";
            else if (
              action === "cancel" &&
              [
                "waiting",
                "connected",
                "station_pending",
                "station_ready",
                "proposed",
                "accepted",
              ].includes(row.state)
            )
              target = "cancelled";
            else
              throw bad("Thao tác không phù hợp với trạng thái hiện tại.", 409);
          }
        } else {
          if (action === "accept" && row.state === "proposed") {
            if (Number(req.body.version) !== row.version)
              throw bad(
                "Phương án đã thay đổi. Hãy xem lại trước khi đồng ý.",
                409,
              );
            target = "accepted";
          } else if (action === "revise" && row.state === "proposed")
            target = row.stationId ? "station_ready" : "connected";
          else if (
            action === "cancel" &&
            [
              "waiting",
              "connected",
              "station_pending",
              "station_ready",
              "proposed",
              "accepted",
            ].includes(row.state)
          )
            target = "cancelled";
          else
            throw bad("Thao tác không phù hợp với trạng thái hiện tại.", 409);
        }
        await conn.execute(
          "UPDATE HoTroNhanh SET state=?,activeGuest=?,technician=?,stationVehicleId=?,updatedAt=NOW() WHERE id=?",
          [
            target,
            terminal.includes(target) ? null : row.activeGuest,
            ["connected", "station_ready"].includes(target)
              ? null
              : row.technician,
            ["connected", "station_ready"].includes(target)
              ? null
              : row.stationVehicleId,
            row.id,
          ],
        );
        await system(
          conn,
          row.id,
          (req.actor?.name || "Khách") + ": " + labels[target] + ".",
        );
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
}
router.post("/api/staff/:id/proposal", async (req, res, next) => {
  try {
    await transaction(req, async (conn, row) => {
      if (row.routingMode === "station") {
        if (!row.stationId || !stationManager(req, row))
          throw bad(
            "Điều phối giao cho trạm, phụ trách trạm mới được cử người và xe.",
            403,
          );
        if (!["station_pending", "station_ready"].includes(row.state))
          throw bad("Yêu cầu không còn chờ trạm cử xe.", 409);
      } else owner(req, row);
      if (row.routingMode !== "station" && row.state !== "connected")
        throw bad(
          "Chỉ gửi phương án sau khi trao đổi; thu hồi phương án cũ nếu cần sửa.",
          409,
        );
      if (row.lat === null && !row.locationText)
        throw bad("Cần xác minh vị trí hoặc địa chỉ trước khi điều phối.");
      const b = req.body;
      const customerVehicle = b.customerVehicle === undefined ? row.vehicle : text(b.customerVehicle,40);
      const customerIssue = b.customerIssue === undefined ? row.issue : text(b.customerIssue,500);
      if (!customerVehicle || !customerIssue)
        throw bad(
          "Cần ghi nhận loại xe và tình trạng trước khi gửi phương án.",
        );
      const eta = Number(b.eta),
        price = Number(b.price),
        tech = Number(b.technician);
      if (
        !Number.isInteger(eta) ||
        eta < 1 ||
        eta > 1440 ||
        b.price === "" ||
        !Number.isSafeInteger(price) ||
        price < 0 ||
        price > 100000000 ||
        !text(b.plan, 2000) ||
        !text(b.priceNote, 500)
      )
        throw bad(
          "Nhập phương án, thời gian 1–1440 phút, chi phí hợp lệ và phạm vi chi phí.",
        );
      let rescueVehicle = null;
      if (row.routingMode === "station") {
        const [[membership]] = await conn.execute(
          "SELECT m.*,a.TrangThai FROM NhanVienTram m JOIN TaiKhoan a ON a.MaTaiKhoan=m.accountId WHERE accountId=? FOR UPDATE",
          [tech],
        );
        if (
          !membership ||
          membership.stationId !== row.stationId ||
          membership.TrangThai !== "HoatDong"
        )
          throw bad("Nhân viên phải thuộc trạm được giao.", 403);
        const [[vehicle]] = await conn.execute(
          "SELECT * FROM XeCuuHoTram WHERE id=? FOR UPDATE",
          [Number(b.stationVehicleId) || 0],
        );
        if (!vehicle || vehicle.stationId !== row.stationId || !vehicle.active)
          throw bad("Chọn xe đang hoạt động thuộc trạm.");
        const [[vehicleBusy]] = await conn.execute(
          "SELECT COUNT(*) n FROM HoTroNhanh WHERE stationVehicleId=? AND state IN ('proposed','accepted','enroute','helping')",
          [vehicle.id],
        );
        if (vehicleBusy.n) throw bad("Xe đang phục vụ yêu cầu khác.", 409);
        rescueVehicle = vehicle.id;
      }
      // Khóa ca trực để hai điều phối viên không cùng giao một nhân viên.
      const [[duty]] = await conn.execute(
        "SELECT c.*,a.TrangThai FROM CaTrucCuuHo c JOIN TaiKhoan a ON a.MaTaiKhoan=c.accountId WHERE accountId=? FOR UPDATE",
        [tech],
      );
      if (
        !duty ||
        !duty.available ||
        duty.TrangThai !== "HoatDong" ||
        (row.routingMode !== "station" &&
          Date.now() - new Date(duty.seenAt.replace(" ", "T")).getTime() >
            60000)
      )
        throw bad("Nhân viên chưa bật sẵn sàng hoặc đã mất kết nối.", 409);
      const [[busy]] = await conn.execute(
        "SELECT COUNT(*) n FROM HoTroNhanh WHERE technician=? AND state IN ('proposed','accepted','enroute','helping')",
        [tech],
      );
      if (busy.n) throw bad("Nhân viên đang có một yêu cầu khác.", 409);
      await conn.execute(
        "UPDATE HoTroNhanh SET vehicle=?,issue=?,stationVehicleId=?,technician=?,plan=?,eta=?,price=?,priceNote=?,state='proposed',version=version+1,updatedAt=NOW() WHERE id=?",
        [
          customerVehicle,
          customerIssue,
          rescueVehicle,
          tech,
          text(b.plan, 2000),
          eta,
          price,
          text(b.priceNote, 500),
          row.id,
        ],
      );
      await system(
        conn,
        row.id,
        req.actor.name +
          " đã nhận yêu cầu, cử người và xe, gửi phương án. Khách xác nhận để nhân viên xuất phát.",
      );
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
require("./station-dispatch")({
  router,
  pool,
  transaction,
  owner,
  system,
  bad,
  text,
  stationManager,
  events,
});
const voice = require("../lib/voice-calls")({
  router,
  accessible,
  events,
  bad,
});
router.get("/events", async (req, res, next) => {
  try {
    let actor = await account(req);
    const id = Number(req.query.id);
    if (!actor) {
      req.params.id = String(id);
      await accessible(req);
    }
    const sessionId = req.sessionID;
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = () => res.write("event: update\ndata: {}\n\n");
    send();
    const listener = (changed) => {
      if (actor || changed === id) send();
    };
    events.on("change", listener);
    const timer = setInterval(async () => {
      try {
        const saved = await new Promise((resolve, reject) =>
          req.sessionStore.get(sessionId, (e, s) =>
            e ? reject(e) : resolve(s),
          ),
        );
        if (!saved) return res.end();
        if (actor && !(await account(req))) return res.end();
        res.write(": heartbeat\n\n");
      } catch {
        res.end();
      }
    }, 15000);
    res.on("close", () => {
      clearInterval(timer);
      events.off("change", listener);
    });
  } catch (e) {
    next(e);
  }
});
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (!err.status) console.error("[Hỗ trợ]", err.code || err.message);
  res.status(err.status || 503).json({
    error: err.status
      ? err.message
      : "Chưa kết nối được dịch vụ hỗ trợ. Vui lòng thử lại hoặc gọi trực tiếp.",
  });
});
module.exports = router;
