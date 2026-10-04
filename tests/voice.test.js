const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config({ quiet: true });
const db = `cuuho_voice_test_${process.pid}_${Date.now()}`;
process.env.DB_NAME = db;
test("Gọi thoại: quyền truy cập, nhận cuộc gọi và kết thúc", async (t) => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });
  let server, pool;
  t.after(async () => {
    if (server)
      await new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      });
    if (pool) await pool.end();
    await conn.query(`DROP DATABASE IF EXISTS \`${db}\``);
    await conn.end();
  });
  await conn.query(
    fs.readFileSync("database.sql", "utf8").replaceAll("cuuho_giaothong", db),
  );
  await require("../scripts/migrate-support")(conn);
  await require("../scripts/migrate-support")(conn);
  const hash = await bcrypt.hash("TestPass@123", 4);
  for (const name of ["staff1", "staff2"])
    await conn.execute(
      "INSERT INTO TaiKhoan(TenDangNhap,MatKhau,HoTen,VaiTro) VALUES(?,?,?,'nhanvien')",
      [name, hash, name],
    );
  pool = require("../config/database");
  await t.test(
    "Phiên khách/nhân viên còn nguyên khi tạo lại kho session; hết hạn và đăng xuất có hiệu lực",
    async () => {
      const SessionStore = require("../lib/mysql-session-store");
      const first = new SessionStore(pool),
        afterRestart = new SessionStore(pool);
      const invoke = (store, method, ...args) =>
        new Promise((resolve, reject) =>
          store[method](...args, (e, value) =>
            e ? reject(e) : resolve(value),
          ),
        );
      await invoke(first, "set", "restart-test", {
        user: { id: 1 },
        supportKey: "private-room",
        cookie: { expires: new Date(Date.now() + 60000).toISOString() },
      });
      assert.equal(
        (await invoke(afterRestart, "get", "restart-test")).supportKey,
        "private-room",
      );
      await invoke(afterRestart, "destroy", "restart-test");
      assert.equal(await invoke(first, "get", "restart-test"), null);
      await invoke(first, "set", "expired-test", {
        cookie: { expires: new Date(0).toISOString() },
      });
      assert.equal(await invoke(afterRestart, "get", "expired-test"), null);
    },
  );
  server = require("../app").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  function client() {
    return {
      cookie: "",
      csrf: "",
      async request(url, body, token = true) {
        const r = await fetch(base + url, {
          method: body ? "POST" : "GET",
          redirect: "manual",
          headers: {
            cookie: this.cookie,
            ...(body ? { "content-type": "application/json" } : {}),
          },
          body: body
            ? JSON.stringify({
                ...body,
                ...(token ? { _csrf: this.csrf } : {}),
              })
            : undefined,
        });
        if (r.headers.getSetCookie().length)
          this.cookie = r.headers
            .getSetCookie()
            .map((x) => x.split(";")[0])
            .join("; ");
        const raw = await r.text();
        const match = raw.match(
          /(?:data-csrf="|name="_csrf" value=")([a-f0-9]+)/,
        );
        if (match) this.csrf = match[1];
        let data;
        try {
          data = JSON.parse(raw);
        } catch {}
        return {
          status: r.status,
          data,
          raw,
          location: r.headers.get("location"),
        };
      },
      async login(name) {
        await this.request("/login");
        assert.equal(
          (
            await this.request("/login", {
              username: name,
              password: "TestPass@123",
            })
          ).status,
          303,
        );
        assert.equal((await this.request("/support/desk")).status, 200);
      },
    };
  }

  const guest = client(),
    other = client(),
    s1 = client(),
    s2 = client();
  await guest.request("/");
  await other.request("/");
  await s1.login("staff1");
  await s2.login("staff2");
  const id = (await guest.request("/support/api/start", {})).data.id;
  const g = "/support/api/guest/" + id + "/call";
  const st = "/support/api/staff/" + id + "/call";
  const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const offer = {
    type: "offer",
    sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
  };
  const answer = {
    type: "answer",
    sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
  };
  let callId;
  await t.test("Khách gọi trước tiếp nhận, bảo vệ phiên và CSRF", async () => {
    assert.equal((await other.request(g)).status, 404);
    assert.equal(
      (
        await guest.request(
          g,
          { action: "start", client: a, description: offer },
          false,
        )
      ).status,
      403,
    );
    callId = (
      await guest.request(g, { action: "start", client: a, description: offer })
    ).data.id;
    assert.ok(callId);
    assert.equal(
      (
        await guest.request(g, {
          action: "start",
          client: a,
          description: offer,
        })
      ).status,
      409,
    );
    assert.equal(
      (await s1.request("/support/api/desk")).data.requests[0].ringing,
      true,
    );
    assert.equal((await s1.request(st)).data.call, null);
    assert.equal(
      (
        await s1.request(st, {
          action: "accept",
          client: b,
          callId,
          description: answer,
        })
      ).status,
      403,
    );
  });
  await t.test(
    "Chỉ người tiếp nhận nhận được SDP, không chiếm cuộc gọi ở thẻ khác",
    async () => {
      assert.equal(
        (
          await s1.request("/support/api/staff/" + id + "/action", {
            action: "claim",
          })
        ).status,
        200,
      );
      const incoming = (await s1.request(st + "?client=" + b)).data.call;
      assert.equal(incoming.incoming, true);
      assert.equal(incoming.offer.type, "offer");
      assert.equal((await s2.request(st)).data.call, null);
      assert.equal((await other.request(st)).status, 401);
      assert.equal(
        (
          await s1.request(st, {
            action: "accept",
            client: b,
            callId,
            description: offer,
          })
        ).status,
        422,
      );
      assert.equal(
        (
          await s1.request(st, {
            action: "accept",
            client: b,
            callId,
            description: answer,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await s1.request(st, {
            action: "accept",
            client: b,
            callId,
            description: answer,
          })
        ).status,
        409,
      );
      const own = (await guest.request(g + "?client=" + a)).data.call;
      assert.equal(own.participant, true);
      assert.equal(own.answer.type, "answer");
      const tab = (await guest.request(g + "?client=" + b)).data.call;
      assert.equal(tab.otherTab, true);
      assert.equal(tab.answer, undefined);
      assert.equal(
        (await guest.request(g, { action: "end", client: b, callId })).status,
        403,
      );
      assert.equal(
        (await guest.request(g, { action: "end", client: a, callId: "wrong" }))
          .status,
        409,
      );
      assert.equal(
        (await guest.request(g, { action: "end", client: a, callId })).status,
        200,
      );
      assert.equal((await s1.request(st)).data.call, null);
    },
  );
  await t.test(
    "Nhân viên gọi lại, khách từ chối, hai bên gọi đồng thời",
    async () => {
      callId = (
        await s1.request(st, { action: "start", client: b, description: offer })
      ).data.id;
      assert.equal(
        (await guest.request(g + "?client=" + a)).data.call.incoming,
        true,
      );
      assert.equal(
        (await guest.request(g, { action: "end", client: a, callId })).status,
        200,
      );
      const race = await Promise.all([
        guest.request(g, { action: "start", client: a, description: offer }),
        s1.request(st, { action: "start", client: b, description: offer }),
      ]);
      assert.deepEqual(race.map((x) => x.status).sort(), [200, 409]);
      const winner = race[0].status === 200 ? guest : s1;
      const path = winner === guest ? g : st,
        clientId = winner === guest ? a : b;
      callId = race.find((x) => x.status === 200).data.id;
      assert.equal(
        (
          await winner.request(path, {
            action: "end",
            client: clientId,
            callId,
          })
        ).status,
        200,
      );
      await guest.request("/support/api/guest/" + id + "/action", {
        action: "cancel",
      });
      assert.equal(
        (
          await guest.request(g, {
            action: "start",
            client: a,
            description: offer,
          })
        ).status,
        409,
      );
    },
  );
  await t.test('Đăng nhập và đăng xuất cùng trình duyệt không làm mất phòng khách', async () => {
    const c = client(); await c.request('/');
    const room = (await c.request('/support/api/start', {})).data.id;
    const token = c.csrf;
    await c.login('staff1');
    assert.equal((await c.request('/support/api/guest/' + room)).status, 200);
    c.csrf = token;
    assert.equal((await c.request('/support/api/guest/' + room + '/message', {text:'Guest tab after login'})).status, 200);
    assert.equal((await c.request('/logout', {})).status, 303);
    assert.equal((await c.request('/support/api/guest/' + room)).status, 200);
    assert.equal((await c.request('/support/api/desk')).status, 401);
    assert.equal((await other.request('/support/room/' + room)).location, '/?roomExpired=1');
  });

});
