const crypto = require("node:crypto");

// Signaling only. Audio goes directly through WebRTC; no audio is recorded here.
module.exports = function voiceCalls({ router, accessible, events, bad }) {
  const calls = new Map();
  function current(id) {
    const c = calls.get(Number(id));
    if (!c) return null;
    const now = Date.now();
    if (
      now > c.deadline ||
      Object.values(c.peers).some((p) => now - p.seen > 25000)
    ) {
      calls.delete(Number(id));
      events.emit("change", Number(id));
      return null;
    }
    return c;
  }
  const sweep = setInterval(() => {
    for (const id of calls.keys()) current(id);
  }, 5000);
  sweep.unref();
  const side = (req) => (req.actor ? "staff:" + req.actor.id : "guest");
  const allowed = (req, row) =>
    !req.actor ||
    [row.dispatcher, row.technician].includes(req.actor.id) ||
    (req.actor.stationId === row.stationId &&
      req.actor.stationManager === 1 &&
      row.state !== "station_pending");
  function busy(key, id) {
    if (key === "guest") return false;
    return [...calls.keys()].some(
      (other) => other !== id && current(other)?.peers[key],
    );
  }
  function description(d, type) {
    if (
      !d ||
      d.type !== type ||
      typeof d.sdp !== "string" ||
      d.sdp.length > 64000 ||
      !d.sdp.startsWith("v=0")
    )
      throw bad("Dữ liệu kết nối thoại không hợp lệ.");
    return { type, sdp: d.sdp };
  }
  function iceServers() {
    const servers = [{ urls: "stun:stun.l.google.com:19302" }];
    if (
      process.env.TURN_URL &&
      process.env.TURN_USERNAME &&
      process.env.TURN_PASSWORD
    )
      servers.push({
        urls: process.env.TURN_URL.split(",").map((x) => x.trim()),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_PASSWORD,
      });
    return servers;
  }
  for (const mode of ["guest", "staff"]) {
    const path = "/api/" + mode + "/:id/call";
    router.get(path, async (req, res, next) => {
      try {
        const row = await accessible(req);
        const permitted =
          allowed(req, row) && !["complete", "cancelled"].includes(row.state);
        const c = current(row.id),
          key = side(req);
        if (!permitted) return res.json({ call: null, canCall: false });
        if (c?.peers[key] && c.peers[key].client === req.query.client)
          c.peers[key].seen = Date.now();
        const mine = c?.peers[key];
        const participant = !!mine && mine.client === req.query.client;
        const incoming =
          !!c &&
          !mine &&
          (c.caller === "guest") !== (key === "guest") &&
          !c.answer;
        res.set("Cache-Control", "no-store").json({
          canCall: true,
          iceServers: iceServers(),
          call: c
            ? {
                id: c.id,
                state: c.answer ? "connecting" : "ringing",
                incoming,
                participant,
                otherTab: !!mine && !participant,
                offer: incoming ? c.offer : undefined,
                answer: participant && c.caller === key ? c.answer : undefined,
              }
            : null,
        });
      } catch (e) {
        next(e);
      }
    });
    router.post(path, async (req, res, next) => {
      try {
        const row = await accessible(req);
        if (!allowed(req, row))
          throw bad("Hãy tiếp nhận yêu cầu trước khi gọi khách.", 403);
        if (["complete", "cancelled"].includes(row.state))
          throw bad("Phiên hỗ trợ đã kết thúc.", 409);
        const b = req.body,
          key = side(req);
        if (
          typeof b.client !== "string" ||
          !/^[a-f0-9-]{16,64}$/.test(b.client)
        )
          throw bad("Phiên gọi không hợp lệ.");
        let c = current(row.id);
        if (b.action === "start") {
          if (c || busy(key, row.id))
            throw bad(
              "Đang có cuộc gọi khác. Hãy kết thúc trước khi gọi lại.",
              409,
            );
          c = {
            id: crypto.randomUUID(),
            caller: key,
            offer: description(b.description, "offer"),
            answer: null,
            deadline: Date.now() + 60000,
            peers: { [key]: { client: b.client, seen: Date.now() } },
          };
          calls.set(row.id, c);
        } else {
          if (!c || b.callId !== c.id)
            throw bad("Cuộc gọi đã kết thúc hoặc không còn hiệu lực.", 409);
          const mine = c.peers[key];
          const incoming =
            !mine && (c.caller === "guest") !== (key === "guest") && !c.answer;
          if (b.action === "accept") {
            if (!incoming || busy(key, row.id))
              throw bad("Cuộc gọi đã có người nghe hoặc bạn đang bận.", 409);
            c.answer = description(b.description, "answer");
            c.peers[key] = { client: b.client, seen: Date.now() };
            c.deadline = Date.now() + 2 * 60 * 60 * 1000;
          } else if (b.action === "end") {
            if (!(mine?.client === b.client || incoming))
              throw bad("Bạn không tham gia cuộc gọi này.", 403);
            calls.delete(row.id);
          } else throw bad("Thao tác gọi không hợp lệ.");
        }
        events.emit("change", row.id);
        res.json({ id: c.id });
      } catch (e) {
        next(e);
      }
    });
  }
  return {
    ringing: (id) => {
      const c = current(id);
      return !!c && c.caller === "guest" && !c.answer;
    },
  };
};
