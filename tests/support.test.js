const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config({ quiet: true });
const db = `cuuho_support_test_${process.pid}_${Date.now()}`;
process.env.DB_NAME = db;
test("Hỗ trợ tức thời: session riêng, điều phối và xác nhận phương án", async (t) => {
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
  let id, tech;
  await t.test(
    "Trang chủ nhanh, tạo không cần nhập và chống tạo trùng",
    async () => {
      assert.equal((await guest.request("/")).status, 200);
      await other.request("/");
      assert.equal(
        (await guest.request("/support/api/start", {}, false)).status,
        403,
      );
      id = (await guest.request("/support/api/start", {})).data.id;
      assert.equal((await guest.request("/support/api/start", {})).data.id, id);
      // Regression coverage for sessions created before station dispatch migration.
      await conn.execute("UPDATE HoTroNhanh SET routingMode='legacy' WHERE id=?",[id]);
      assert.equal((await guest.request("/support/room/" + id)).status, 200);
      assert.equal(
        (await other.request("/support/api/guest/" + id)).status,
        404,
      );
      assert.equal(
        (await other.request("/support/api/staff/" + id)).status,
        401,
      );
    },
  );
  const g = "/support/api/guest/",
    s = "/support/api/staff/";
  await t.test(
    "Tin nhắn, tệp riêng tư và từ chối định dạng nguy hiểm",
    async () => {
      assert.equal(
        (
          await guest.request(g + id + "/message", {
            text: "Xe không nổ <script>alert(1)</script>",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await guest.request(g + id + "/message", {
            media: Buffer.from("<svg onload=alert(1)>bad</svg>").toString(
              "base64",
            ),
          })
        ).status,
        422,
      );
      const png =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=";
      assert.equal(
        (await guest.request(g + id + "/message", { media: png })).status,
        200,
      );
      const snapshot = (await guest.request(g + id)).data;
      const media = snapshot.messages.find((m) => m.mime);
      assert.equal(
        (await other.request(g + id + "/media/" + media.id)).status,
        404,
      );
      assert.equal(
        (await guest.request(g + id + "/media/" + media.id)).status,
        200,
      );
      assert.ok(!("guestHash" in snapshot.request));
    },
  );
  await s1.login("staff1");
  await s2.login("staff2");
  await t.test("Nhận đồng thời chỉ một người thành công", async () => {
    const results = await Promise.all([
      s1.request(s + id + "/action", { action: "claim" }),
      s2.request(s + id + "/action", { action: "claim" }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    if (results[1].status === 200) {
      const c = s1.cookie,
        z = s1.csrf;
      s1.cookie = s2.cookie;
      s1.csrf = s2.csrf;
      s2.cookie = c;
      s2.csrf = z;
    }
    assert.equal(
      (await s2.request(s + id + "/message", { text: "Không phụ trách" }))
        .status,
      403,
    );
    assert.equal(
      (await guest.request(g + id + "/action", { action: "enroute" })).status,
      409,
    );
  });
  await t.test(
    "Phương án yêu cầu vị trí, loại xe, sự cố, người sẵn sàng",
    async () => {
      const team = (await s1.request("/support/api/desk")).data;
      tech = team.actor.id;
      assert.equal(
        (
          await s1.request(s + id + "/proposal", {
            technician: tech,
            eta: 20,
            price: 100000,
            plan: "Sửa tại chỗ",
            priceNote: "Phí kiểm tra",
          })
        ).status,
        422,
      );
      assert.equal(
        (await guest.request(g + id + "/details", { lat: 999, lng: 1 })).status,
        422,
      );
      assert.equal(
        (
          await guest.request(g + id + "/details", {
            lat: 21.0285,
            lng: 105.8542,
            vehicle: "Xe máy",
            issue: "Không nổ máy",
            locationText: "Điểm thử nghiệm",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await s1.request("/support/api/duty", {
            available: true,
            area: "Hà Nội",
            capability: "Xe máy",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await s1.request(s + id + "/proposal", {
            technician: tech,
            eta: 20,
            price: 100000,
            plan: "Kiểm tra tại chỗ",
            priceNote: "Phí kiểm tra, phụ tùng báo riêng",
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await guest.request(g + id + "/details", {
            locationText: "Thay vị trí khi đã chốt",
          })
        ).status,
        409,
      );
      assert.equal(
        (await s1.request(s + id + "/action", { action: "enroute" })).status,
        409,
      );
    },
  );
  await t.test(
    "Không giao cùng nhân viên cho hai yêu cầu và có thể xin sửa phương án",
    async () => {
      const second = (await other.request("/support/api/start", {})).data.id;
      await conn.execute("UPDATE HoTroNhanh SET routingMode='legacy' WHERE id=?",[second]);
      await s2.request(s + second + "/action", { action: "claim" });
      await other.request(g + second + "/details", {
        locationText: "Điểm thử nghiệm thứ hai",
        vehicle: "Ô tô",
        issue: "Ắc quy yếu",
      });
      assert.equal(
        (
          await s2.request(s + second + "/proposal", {
            technician: tech,
            eta: 20,
            price: 100000,
            plan: "Kiểm tra",
            priceNote: "Phí kiểm tra",
          })
        ).status,
        409,
      );
      assert.equal(
        (await other.request(g + second + "/action", { action: "cancel" }))
          .status,
        200,
      );
      assert.equal(
        (await guest.request(g + id + "/action", { action: "revise" })).status,
        200,
      );
      assert.equal(
        (
          await guest.request(g + id + "/action", {
            action: "accept",
            version: 1,
          })
        ).status,
        409,
      );
      await s1.request("/support/api/heartbeat", {});
      assert.equal(
        (
          await s1.request(s + id + "/proposal", {
            technician: tech,
            eta: 25,
            price: 120000,
            plan: "Kiểm tra và kích bình",
            priceNote: "Phụ tùng báo riêng",
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "SSE thông báo, xác nhận đúng phiên bản và đúng thứ tự",
    async () => {
      const controller = new AbortController();
      const response = await fetch(base + "/support/events?id=" + id, {
        headers: { cookie: guest.cookie },
        signal: controller.signal,
      });
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      const reader = response.body.getReader();
      assert.match(
        new TextDecoder().decode((await reader.read()).value),
        /event: update/,
      );
      const r = (await guest.request(g + id)).data.request;
      assert.equal(
        (
          await guest.request(g + id + "/action", {
            action: "accept",
            version: r.version - 1,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await guest.request(g + id + "/action", {
            action: "accept",
            version: r.version,
          })
        ).status,
        200,
      );
      assert.match(
        new TextDecoder().decode((await reader.read()).value),
        /event: update/,
      );
      controller.abort();
      assert.equal(
        (await s2.request(s + id + "/action", { action: "enroute" })).status,
        403,
      );
      assert.equal(
        (await s1.request(s + id + "/action", { action: "complete" })).status,
        409,
      );
      for (const action of ["enroute", "helping", "complete"])
        assert.equal(
          (await s1.request(s + id + "/action", { action })).status,
          200,
        );
      assert.equal(
        (await guest.request(g + id + "/message", { text: "Kết thúc" })).status,
        409,
      );
      assert.notEqual(
        (await guest.request("/support/api/start", {})).data.id,
        id,
      );
    },
  );
  await t.test("Khóa tài khoản có hiệu lực với API và ca trực", async () => {
    await conn.execute(
      "UPDATE TaiKhoan SET TrangThai='Khoa' WHERE MaTaiKhoan=?",
      [tech],
    );
    assert.equal((await s1.request("/support/api/desk")).status, 401);
  });
});
