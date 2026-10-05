const { test } = require("node:test");
const assert = require("node:assert/strict");
const mysql = require("mysql2/promise");
const fs = require("node:fs");
const bcrypt = require("bcrypt");
const { nearest, valid, distance } = require("../public/js/nearest-station");
require("dotenv").config({ quiet: true });
test("Khoảng cách, dữ liệu thiếu, điểm tạm ngừng và ưu tiên điểm thật", () => {
  const points = [
    { id: 1, lat: 20.968, lng: 105.841, active: 1, isDemo: 1 },
    { id: 2, lat: 21.005, lng: 105.526, active: 1, isDemo: 1 },
    { id: 3, lat: 20.973, lng: 105.945, active: 1, isDemo: 1 },
    { id: 5, lat: 20.996, lng: 105.793, active: 1, isDemo: 1 },
    { id: 6, lat: 21, lng: 105.891, active: 1, isDemo: 1 },
  ];
  assert.equal(nearest(points, 20.969, 105.842).id, 1);
  assert.equal(nearest(points, 21.006, 105.527).id, 2);
  assert.equal(nearest(points, 20.974, 105.946).id, 3);
  assert.equal(nearest(points, 20.996, 105.793).id, 5);
  assert.equal(nearest(points, 21, 105.891).id, 6);
  assert.equal(nearest(points, null, null), null);
  assert.equal(valid(" ", true), false);
  assert.equal(
    nearest(
      points.map((p) => ({ ...p, active: 0 })),
      21,
      105,
    ),
    null,
  );
  assert.equal(
    nearest(
      [...points, { id: 4, lat: 22, lng: 105, active: 1, isDemo: 0 }],
      20.968,
      105.841,
    ).id,
    4,
  );
  assert.equal(distance(0, 0, 0, 0), 0);
  assert.ok(Math.abs(distance(0, 0, 0, 1) - 111.195) < 0.01);
  assert.equal(
    nearest([{ ...points[0], id: 9 }, points[0]], 20.968, 105.841).id,
    1,
  );
});
test("Quản trị điểm cứu hộ và khách/nhân viên cùng nhận điểm gần nhất", async (t) => {
  const db = "cuuho_stations_test_" + process.pid + "_" + Date.now();
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
    await conn.query("DROP DATABASE IF EXISTS `" + db + "`");
    await conn.end();
  });
  await conn.query(
    fs.readFileSync("database.sql", "utf8").replaceAll("cuuho_giaothong", db),
  );
  await require("../scripts/migrate-support")(conn);
  await require("../scripts/migrate-support")(conn);
  const hash = await bcrypt.hash("Test@1234", 4);
  await conn.execute(
    "INSERT INTO TaiKhoan(TenDangNhap,MatKhau,HoTen,VaiTro) VALUES('manager',?,'Test Admin','admin'),('worker',?,'Test Staff','nhanvien')",
    [hash, hash],
  );
  process.env.DB_NAME = db;
  pool = require("../config/database");
  server = require("../app").listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  function client() {
    return {
      cookie: "",
      csrf: "",
      async req(path, body, csrf = true, json = false) {
        const r = await fetch(base + path, {
          method: body ? "POST" : "GET",
          redirect: "manual",
          headers: {
            cookie: this.cookie,
            ...(body
              ? { "Content-Type": json ? "application/json" : "application/x-www-form-urlencoded" }
              : {}),
          },
          body: body
            ? (json ? JSON.stringify({ ...body, ...(csrf ? { _csrf: this.csrf } : {}) }) : new URLSearchParams({
                ...body,
                ...(csrf ? { _csrf: this.csrf } : {}),
              }).toString())
            : undefined,
        });
        if (r.headers.getSetCookie().length)
          this.cookie = r.headers
            .getSetCookie()
            .map((c) => c.split(";")[0])
            .join("; ");
        const raw = await r.text();
        const m = raw.match(/(?:data-csrf="|name="_csrf" value=")([a-f0-9]+)/);
        if (m) this.csrf = m[1];
        let data;
        try {
          data = JSON.parse(raw);
        } catch {}
        return { status: r.status, data, raw };
      },
      async login(name) {
        await this.req("/login");
        assert.equal(
          (await this.req("/login", { username: name, password: "Test@1234" }))
            .status,
          303,
        );
        await this.req("/support/desk");
      },
    };
  }
  const admin = client(),
    guest = client(),
    staff = client();
  await admin.login("manager");
  await staff.login("worker");
  await guest.req("/");
  assert.equal((await staff.req("/admin/stations")).status, 403);
  assert.equal((await guest.req("/admin/stations")).status, 302);
  assert.equal(
    (await admin.req("/admin/stations/demo", {}, false)).status,
    403,
  );
  assert.equal((await admin.req("/admin/stations/demo", {})).status, 303);
  assert.equal((await admin.req("/admin/stations/demo", {})).status, 303);
  const [[count]] = await conn.query("SELECT COUNT(*) n FROM DiemCuuHo");
  assert.equal(count.n, 5);
  const id = (await guest.req("/support/api/start", {})).data.id;
  assert.equal(
    (await guest.req("/support/api/guest/" + id)).data.nearestStation,
    null,
  );
  assert.equal(
    (
      await guest.req("/support/api/guest/" + id + "/details", {
        lat: "21.006",
        lng: "105.527",
        locationText: "TEST",
      })
    ).status,
    200,
  );
  const g = (await guest.req("/support/api/guest/" + id)).data;
  const s = (await staff.req("/support/api/staff/" + id)).data;
  assert.match(g.nearestStation.name, /Hòa Lạc/);
  assert.equal(s.nearestStation.id, g.nearestStation.id);
  assert.equal(
    (
      await admin.req("/admin/stations/save", {
        name: "Bad",
        address: "Bad",
        lat: "100",
        lng: "0",
        active: "1",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await admin.req("/admin/stations/save", {
        name: "Test real",
        address: "Test address",
        lat: "20.97",
        lng: "105.84",
        active: "1",
      })
    ).status,
    303,
  );
  assert.equal(
    (await guest.req("/support/api/guest/" + id)).data.nearestStation.name,
    "Test real",
  );
  const [[real]] = await conn.query("SELECT id FROM DiemCuuHo WHERE isDemo=0");
  assert.equal(
    (
      await admin.req("/admin/stations/" + real.id + "/save", {
        name: "Test real",
        address: "Test address",
        lat: "20.97",
        lng: "105.84",
      })
    ).status,
    303,
  );
  assert.match(
    (await guest.req("/support/api/guest/" + id)).data.nearestStation.name,
    /Hòa Lạc/,
  );
  const [[home]] = await conn.query(
    "SELECT id FROM DiemCuuHo WHERE demoKey='hoalac'",
  );
  const [[worker]] = await conn.query(
    "SELECT MaTaiKhoan id FROM TaiKhoan WHERE TenDangNhap='worker'",
  );
  assert.equal(
    (
      await admin.req("/admin/stations/member", {
        accountId: worker.id,
        stationId: home.id,
        manager: "1",
      })
    ).status,
    303,
  );
  assert.equal((await staff.req("/support/api/staff/" + id)).status, 403);
  assert.equal(
    (
      await admin.req("/support/api/staff/" + id + "/action", {
        action: "claim",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.req("/support/api/staff/" + id + "/proposal", {
        technician: worker.id,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.req("/support/api/staff/" + id + "/dispatch", {
        stationId: home.id,
      })
    ).status,
    200,
  );
  assert.equal(
    (await staff.req("/support/api/staff/" + id)).data.request.state,
    "station_pending",
  );
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id + "/action", {
        action: "station_accept",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id + "/action", {
        action: "station_accept",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id + "/details", {
        vehicle: "Ô tô",
        issue: "TEST",
        locationText: "TEST",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.req("/admin/stations/vehicle", {
        stationId: home.id,
        name: "Test tow truck",
        plate: "TEST-001",
        capability: "Ô tô",
      })
    ).status,
    303,
  );
  const [[truck]] = await conn.query(
    "SELECT id FROM XeCuuHoTram WHERE plate='TEST-001'",
  );
  await conn.execute(
    "INSERT INTO CaTrucCuuHo(accountId,available) VALUES(?,1)",
    [worker.id],
  );
  const plan = {
    technician: worker.id,
    stationVehicleId: truck.id,
    plan: "TEST rescue",
    eta: "10",
    price: "100000",
    priceNote: "TEST all",
  };
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id + "/proposal", {
        ...plan,
        stationVehicleId: "0",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id + "/proposal", {
        ...plan,
        technician: "999999",
      })
    ).status,
    403,
  );
  assert.equal(
    (await staff.req("/support/api/staff/" + id + "/proposal", plan)).status,
    200,
  );
  const secondGuest = client();
  await secondGuest.req("/");
  const busyId = (await secondGuest.req("/support/api/start", {})).data.id;
  await secondGuest.req("/support/api/guest/" + busyId + "/details", {
    lat: "21.006",
    lng: "105.527",
    vehicle: "Ô tô",
    issue: "TEST",
  });
  await admin.req("/support/api/staff/" + busyId + "/action", {
    action: "claim",
  });
  await admin.req("/support/api/staff/" + busyId + "/dispatch", {
    stationId: home.id,
  });
  await staff.req("/support/api/staff/" + busyId + "/action", {
    action: "station_accept",
  });
  assert.equal(
    (await staff.req("/support/api/staff/" + busyId + "/proposal", plan))
      .status,
    409,
  );
  await admin.req("/admin/stations/vehicle", {
    stationId: home.id,
    name: "Spare truck",
    plate: "TEST-002",
  });
  const [[spare]] = await conn.query(
    "SELECT id FROM XeCuuHoTram WHERE plate='TEST-002'",
  );
  assert.equal(
    (
      await staff.req("/support/api/staff/" + busyId + "/proposal", {
        ...plan,
        stationVehicleId: spare.id,
      })
    ).status,
    409,
  );
  const stationDesk = (await staff.req("/support/api/desk")).data;
  assert.ok(stationDesk.requests.every((r) => r.stationId === home.id));
  const assigned = (await guest.req("/support/api/guest/" + id)).data.request;
  assert.equal(assigned.stationId, home.id);
  assert.equal(assigned.technician, worker.id);
  assert.equal(assigned.rescueVehiclePlate, "TEST-001");
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id + "/action", {
        action: "enroute",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await guest.req("/support/api/guest/" + id + "/action", {
        action: "accept",
        version: assigned.version,
      })
    ).status,
    200,
  );
  // The station manager may update the assigned technician's journey.
  await conn.execute("INSERT INTO TaiKhoan(TenDangNhap,MatKhau,HoTen,VaiTro) VALUES('boss',?,'Station boss','nhanvien'),('observer',?,'Station observer','nhanvien')",[hash,hash]);
  const [extra]=await conn.query("SELECT MaTaiKhoan id,TenDangNhap username FROM TaiKhoan WHERE TenDangNhap IN ('boss','observer')");
  for(const person of extra) await conn.execute("INSERT INTO NhanVienTram(accountId,stationId,manager) VALUES(?,?,?)",[person.id,home.id,person.username==='boss'?1:0]);
  const boss=client(),observer=client();await boss.login('boss');await observer.login('observer');
  assert.equal((await observer.req('/support/api/staff/'+id+'/action',{action:'enroute'})).status,403);
  assert.equal((await boss.req('/support/api/staff/'+id+'/action',{action:'helping'})).status,409);
  for (const action of ["enroute", "helping", "complete"])
    assert.equal(
      (await (action === "helping" ? staff : boss).req("/support/api/staff/" + id + "/action", { action }))
        .status,
      200,
    );
  assert.equal(
    (await staff.req("/support/api/staff/" + busyId + "/proposal", plan))
      .status,
    200,
  );
  await secondGuest.req("/support/api/guest/" + busyId + "/action", {
    action: "cancel",
  });
  const id2 = (await guest.req("/support/api/start", {})).data.id;
  await guest.req("/support/api/guest/" + id2 + "/details", {
    lat: "21.006",
    lng: "105.527",
  });
  await admin.req("/support/api/staff/" + id2 + "/action", { action: "claim" });
  await admin.req("/support/api/staff/" + id2 + "/dispatch", {
    stationId: home.id,
  });
  await staff.req("/support/api/staff/" + id2 + "/action", {action:"station_accept"});
  assert.equal(
    (
      await staff.req("/support/api/staff/" + id2 + "/action", {
        action: "station_decline",
        reason: "TEST hết xe",
      })
    ).status,
    200,
  );
  assert.equal((await staff.req("/support/api/staff/" + id2)).status, 403);
  assert.notEqual(
    (await guest.req("/support/api/guest/" + id2)).data.nearestStation.id,
    home.id,
  );
  assert.equal(
    (
      await admin.req("/support/api/staff/" + id2 + "/dispatch", {
        stationId: home.id,
      })
    ).status,
    422,
  );
  const quick=client();await quick.req('/');
  const quickId=(await quick.req('/support/api/start',{})).data.id;
  const locUrl='/support/api/guest/'+quickId+'/location';
  await quick.req('/support/api/guest/'+quickId+'/details',{vehicle:'Ô tô',issue:'Xịt lốp',phone:'0912345678',locationText:'TEST địa chỉ'});
  assert.equal((await guest.req(locUrl,{lat:21.006,lng:105.527},true,true)).status,404);
  assert.equal((await quick.req(locUrl,{lat:true,lng:105.527},true,true)).status,422);
  assert.equal((await quick.req(locUrl,{lat:91,lng:105.527},true,true)).status,422);
  assert.equal((await quick.req(locUrl,{lat:21.006,lng:105.527},true,true)).status,200);
  assert.equal((await quick.req(locUrl,{lat:21.006,lng:105.527},false,true)).status,403);
  const located=(await quick.req('/support/api/guest/'+quickId)).data.request;
  assert.equal(located.vehicle,'Ô tô');assert.equal(located.issue,'Xịt lốp');assert.equal(located.phone,'0912345678');assert.equal(located.locationText,'TEST địa chỉ');
  assert.equal(located.lat,21.006);assert.equal(located.lng,105.527);
  assert.equal((await admin.req('/support/api/staff/'+quickId+'/dispatch',{stationId:home.id})).status,200);
  assert.equal((await staff.req('/support/api/staff/'+quickId)).data.request.state,'station_pending');
  const kept=(await quick.req(locUrl,{lat:20,lng:100},true,true)).data;
  assert.equal(kept.kept,true);assert.equal(kept.lat,21.006);assert.equal(kept.lng,105.527);
  assert.equal((await staff.req('/support/api/staff/'+quickId+'/proposal',{...plan,customerVehicle:'',customerIssue:''})).status,422);
  assert.equal((await staff.req('/support/api/staff/'+quickId+'/proposal',{...plan,customerVehicle:'Ô tô',customerIssue:'Xe không nổ máy'})).status,200);
  const quickRow=(await quick.req('/support/api/guest/'+quickId)).data.request;
  assert.equal(quickRow.state,'proposed');assert.equal(quickRow.vehicle,'Ô tô');assert.equal(quickRow.issue,'Xe không nổ máy');

});
