module.exports = ({ router, transaction, owner, system, bad, text }) => {
  router.post("/api/staff/:id/dispatch", async (req, res, next) => {
    try {
      await transaction(req, async (conn, row) => {
        if (row.state === 'waiting' && !row.dispatcher && (!req.actor.stationId || req.actor.role==='admin')) {
          await conn.execute("UPDATE HoTroNhanh SET dispatcher=?,state='connected' WHERE id=?",[req.actor.id,row.id]);
          row.dispatcher=req.actor.id;row.state='connected';
        }
        owner(req, row);
        if (req.actor.stationId && req.actor.role !== "admin")
          throw bad("Chỉ điều phối viên được giao trạm.", 403);
        if (!["connected", "station_pending", "station_ready"].includes(row.state))
          throw bad("Cần tiếp nhận và trao đổi trước khi giao trạm.", 409);
        if (row.lat === null || row.lng === null)
          throw bad("Khách cần gửi vị trí để chọn trạm.");
        const [all] = await conn.query(
          "SELECT * FROM DiemCuuHo WHERE active=1",
        );
        const [declined] = await conn.execute(
          "SELECT stationId FROM HoTroTramTuChoi WHERE requestId=?",
          [row.id],
        );
        const candidates = require("../public/js/nearest-station")
          .eligible(all)
          .filter((s) => !declined.some((d) => d.stationId === s.id));
        const selected = candidates.find(
          (s) => s.id === Number(req.body.stationId),
        );
        if (!selected)
          throw bad("Trạm tạm ngừng, đã từ chối hoặc không được chọn.");
        const nearest = require("../public/js/nearest-station").nearest(
          candidates,
          row.lat,
          row.lng,
        );
        const reason = text(req.body.reason, 500);
        if (selected.id !== nearest?.id && !reason)
          throw bad("Nhập lý do khi chọn trạm khác trạm gần nhất.");
        await conn.execute(
          "UPDATE HoTroNhanh SET stationId=?,stationVehicleId=NULL,technician=NULL,plan=NULL,state='station_pending',routingMode='station',version=version+1,updatedAt=NOW() WHERE id=?",
          [selected.id, row.id],
        );
        await system(
          conn,
          row.id,
          "Điều phối đã giao cho " +
            selected.name +
            ". Chờ trạm tiếp nhận." +
            (reason ? " Lý do lựa chọn: " + reason : ""),
        );
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
};
