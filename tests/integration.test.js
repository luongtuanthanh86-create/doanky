const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ quiet: true });

// Chỉ tạo/xóa database có tên riêng do bài test sinh ra, không dùng database demo.
const testDatabase = `cuuho_test_${process.pid}_${Date.now()}`;
process.env.DB_NAME = testDatabase;
test('Luồng HTTP với database thật, session và phân quyền', async (t) => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  let server, pool;
  t.after(async () => {
    if (server)
      await new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    if (pool) await pool.end();
    await connection.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
    await connection.end();
  });
  const sql = fs
    .readFileSync(path.join(__dirname, '../database.sql'), 'utf8')
    .replaceAll('cuuho_giaothong', testDatabase);
  await connection.query(sql);
  const hash = await bcrypt.hash('TestPass@123', 4);
  for (const [username, role] of [
    ['admin', 'admin'],
    ['staff1', 'nhanvien'],
    ['staff2', 'nhanvien'],
  ]) {
    await connection.execute(
      'INSERT INTO TaiKhoan (TenDangNhap,MatKhau,HoTen,SoDienThoai,VaiTro) VALUES (?,?,?,?,?)',
      [username, hash, username, '0900000000', role],
    );
  }
  pool = require('../config/database');
  const app = require('../app');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '',
      csrf = '';
    return {
      async request(url, body, includeCsrf = true) {
        const response = await fetch(base + url, {
          method: body ? 'POST' : 'GET',
          redirect: 'manual',
          headers: {
            cookie,
            ...(body
              ? { 'content-type': 'application/x-www-form-urlencoded' }
              : {}),
          },
          body: body
            ? new URLSearchParams({
                ...(includeCsrf ? { _csrf: csrf } : {}),
                ...body,
              })
            : undefined,
        });
        if (response.headers.getSetCookie().length)
          cookie = response.headers
            .getSetCookie()
            .map((item) => item.split(';')[0])
            .join('; ');
        const html = await response.text();
        const token = html.match(/name="_csrf" value="([a-f0-9]+)"/);
        if (token) csrf = token[1];
        return {
          status: response.status,
          location: response.headers.get('location'),
          html,
          cookie,
        };
      },
      async login(username) {
        const before = await this.request('/login');
        const result = await this.request('/login', {
          username,
          password: 'TestPass@123',
        });
        assert.equal(result.status, 303);
        assert.notEqual(
          result.cookie,
          before.cookie,
          'Đổi session ID khi đăng nhập',
        );
        assert.equal((await this.request(result.location)).status, 200);
      },
    };
  }
  const guest = client(),
    staff1 = client(),
    staff2 = client(),
    admin = client();
  let requestId;
  await t.test(
    'Trang công khai, tài nguyên, 404 và chặn truy cập chưa đăng nhập',
    async () => {
      for (const url of [
        '/',
        '/tracking',
        '/login',
        '/css/style.css',
        '/js/app.js',
        '/vendor/leaflet/leaflet.js',
        '/vendor/leaflet/images/marker-icon.png',
        '/vendor/bootstrap/css/bootstrap.min.css',
      ])
        assert.equal((await guest.request(url)).status, 200, url);
      assert.equal((await guest.request('/missing')).status, 404);
      assert.equal(
        (await guest.request('/admin/dashboard')).location,
        '/login',
      );
      assert.equal((await guest.request('/staff/requests')).location, '/login');
      assert.equal((await guest.request('/success')).location, '/tracking');
    },
  );
  const rescue = {
    HoTen: 'Khách kiểm thử <script>alert(1)</script>',
    SoDienThoai: '+84901234567',
    LoaiXe: 'Xe máy',
    BienSo: '59-A1',
    MaLoai: '1',
    MoTa: 'Thủng lốp',
    ViDo: '10.7769',
    KinhDo: '106.7009',
  };
  await t.test(
    'CSRF, dữ liệu thiếu, tọa độ, loại xe và loại sự cố khóa',
    async () => {
      await guest.request('/');
      assert.equal(
        (await guest.request('/requests', rescue, false)).status,
        403,
      );
      assert.equal((await guest.request('/requests', {})).status, 422);
      for (const fields of [
        { ViDo: '' },
        { KinhDo: '181' },
        { ViDo: 'NaN' },
        { SoDienThoai: 'abc' },
        { LoaiXe: 'Tàu bay' },
        { MaLoai: '999' },
        { HoTen: ' ' },
      ])
        assert.equal(
          (await guest.request('/requests', { ...rescue, ...fields })).status,
          422,
        );
      await connection.query(
        "UPDATE LoaiSuCo SET TrangThai='Khoa' WHERE MaLoai=2",
      );
      assert.equal(
        (await guest.request('/requests', { ...rescue, MaLoai: '2' })).status,
        422,
      );
      assert.doesNotMatch((await guest.request('/')).html, /<option value="2"/);
    },
  );
  await t.test(
    'Gửi yêu cầu, chuẩn hóa SĐT, escape XSS và tra cứu chỉ bằng SĐT',
    async () => {
      const result = await guest.request('/requests', rescue);
      assert.equal(result.status, 303);
      const success = await guest.request('/success');
      assert.equal(success.status, 200);
      assert.match(success.html, /&lt;script&gt;/);
      assert.doesNotMatch(success.html, /<script>alert/);
      const [[row]] = await connection.query(
        'SELECT * FROM YeuCauCuuHo ORDER BY MaYeuCau DESC LIMIT 1',
      );
      requestId = row.MaYeuCau;
      assert.equal(row.TrangThai, 'ChoTiepNhan');
      assert.equal(row.MaNhanVien, null);
      assert.equal(row.SoDienThoai, '0901234567');
      assert.ok(row.ThoiGianGui);
      assert.ok(row.ThoiGianCapNhat);
      const otherGuest = client();
      assert.equal(
        (await otherGuest.request('/success')).location,
        '/tracking',
      );
      assert.match(
        (
          await guest.request('/tracking', {
            MaYeuCau: requestId,
            SoDienThoai: '0900000099',
          })
        ).html,
        /Không tìm thấy yêu cầu phù hợp/,
      );
      assert.match(
        (
          await guest.request('/tracking', {
            SoDienThoai: '+84901234567',
          })
        ).html,
        /Chờ tiếp nhận/,
      );
    },
  );
  await t.test(
    'Một SĐT có nhiều yêu cầu; chọn đúng yêu cầu và không đọc mã của SĐT khác',
    async () => {
      assert.doesNotMatch(
        (await guest.request('/tracking')).html,
        /id="MaYeuCau"/,
      );
      assert.equal(
        (await guest.request('/tracking', { SoDienThoai: '' })).status,
        422,
      );
      const [created] = await connection.execute(
        `INSERT INTO YeuCauCuuHo
      (HoTen,SoDienThoai,LoaiXe,MaLoai,ViDo,KinhDo) VALUES (?,?,?,?,?,?)`,
        ['Khách cùng số lần hai', '0901234567', 'Ô tô', 1, 21, 105],
      );
      const result = await guest.request('/tracking', {
        SoDienThoai: '+84901234567',
      });
      assert.equal(result.status, 200);
      assert.match(result.html, /Tìm thấy 2 yêu cầu/);
      assert.match(result.html, /Khách cùng số lần hai/);
      assert.ok(
        result.html.indexOf(`#${created.insertId}`) <
          result.html.indexOf(`#${requestId}`),
      );
      const old = await guest.request('/tracking', {
        SoDienThoai: '0901234567',
        MaYeuCau: requestId,
      });
      assert.match(old.html, /&lt;script&gt;/);
      const wrongPhoneId = await guest.request('/tracking', {
        SoDienThoai: '0900000000',
        MaYeuCau: requestId,
      });
      assert.match(wrongPhoneId.html, /Không tìm thấy yêu cầu phù hợp/);
      assert.doesNotMatch(wrongPhoneId.html, /&lt;script&gt;/);
    },
  );
  await t.test(
    'Đăng nhập sai, SQL injection và phân quyền hai vai trò',
    async () => {
      await staff1.request('/login');
      assert.equal(
        (
          await staff1.request('/login', {
            username: "admin' OR 1=1 --",
            password: 'x',
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await staff1.request('/login', {
            username: 'admin',
            password: 'wrong',
          })
        ).status,
        401,
      );
      await staff1.login('staff1');
      await staff2.login('staff2');
      await admin.login('admin');
      assert.equal((await staff1.request('/admin/dashboard')).status, 403);
      assert.equal((await admin.request('/staff/dashboard')).status, 403);
      for (const url of [
        '/admin/dashboard',
        '/admin/requests',
        '/admin/users',
        '/admin/users/new',
        '/admin/users/2/edit',
        '/admin/incident-types',
        '/admin/incident-types/new',
        '/admin/incident-types/1/edit',
        `/admin/requests/${requestId}`,
      ])
        assert.equal((await admin.request(url)).status, 200, url);
      for (const url of [
        '/staff/dashboard',
        '/staff/requests?status=ChoTiepNhan',
        `/staff/requests/${requestId}`,
      ])
        assert.equal((await staff1.request(url)).status, 200, url);
      assert.equal((await staff1.request('/staff/requests/abc')).status, 400);
      assert.equal((await staff1.request('/staff/requests/9999')).status, 404);
    },
  );
  let winner, loser;
  await t.test(
    'Hai nhân viên nhận đồng thời: chỉ đúng một người thành công',
    async () => {
      assert.equal(
        (
          await staff1.request(`/staff/requests/${requestId}/status`, {
            status: 'HoanThanh',
          })
        ).status,
        409,
      );
      const results = await Promise.all([
        staff1.request(`/staff/requests/${requestId}/accept`, {}),
        staff2.request(`/staff/requests/${requestId}/accept`, {}),
      ]);
      assert.deepEqual(results.map((item) => item.status).sort(), [303, 409]);
      winner = results[0].status === 303 ? staff1 : staff2;
      loser = winner === staff1 ? staff2 : staff1;
      const [[row]] = await connection.query(
        'SELECT * FROM YeuCauCuuHo WHERE MaYeuCau=?',
        [requestId],
      );
      assert.equal(row.TrangThai, 'DaTiepNhan');
      assert.ok(row.MaNhanVien);
    },
  );
  await t.test(
    'Người phụ trách, thứ tự trạng thái, hoàn thành và tra cứu mới nhất',
    async () => {
      assert.equal(
        (
          await loser.request(`/staff/requests/${requestId}/status`, {
            status: 'DangXuLy',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await winner.request(`/staff/requests/${requestId}/status`, {
            status: 'HoanThanh',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await winner.request(`/staff/requests/${requestId}/status`, {
            status: 'Huy',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await winner.request(`/staff/requests/${requestId}/status`, {
            status: 'DangXuLy',
          })
        ).status,
        303,
      );
      assert.equal(
        (
          await winner.request(`/staff/requests/${requestId}/status`, {
            status: 'DangXuLy',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await winner.request(`/staff/requests/${requestId}/status`, {
            status: 'HoanThanh',
          })
        ).status,
        303,
      );
      assert.equal(
        (
          await winner.request(`/staff/requests/${requestId}/status`, {
            status: 'HoanThanh',
          })
        ).status,
        409,
      );
      const detail = await winner.request(`/staff/requests/${requestId}`);
      assert.equal(detail.status, 200);
      assert.doesNotMatch(
        detail.html,
        /action="\/staff\/requests\/\d+\/status"/,
      );
      const tracking = await guest.request('/tracking', {
        MaYeuCau: requestId,
        SoDienThoai: '0901234567',
      });
      assert.match(tracking.html, /status-HoanThanh/);
      assert.match(tracking.html, /staff[12]/);
    },
  );
  await t.test(
    'Thêm/sửa nhân viên, bcrypt, trùng username, khóa và thu hồi phiên',
    async () => {
      const account = {
        HoTen: 'Nhân viên mới',
        SoDienThoai: '0900000004',
        TenDangNhap: 'staff3',
        MatKhau: 'TestPass@123',
        VaiTro: 'nhanvien',
        TrangThai: 'HoatDong',
      };
      assert.equal(
        (await admin.request('/admin/users', { ...account, VaiTro: 'admin' }))
          .status,
        422,
      );
      assert.equal((await admin.request('/admin/users', account)).status, 303);
      assert.equal((await admin.request('/admin/users', account)).status, 422);
      const [[created]] = await connection.query(
        "SELECT * FROM TaiKhoan WHERE TenDangNhap='staff3'",
      );
      assert.notEqual(created.MatKhau, account.MatKhau);
      assert.ok(await bcrypt.compare(account.MatKhau, created.MatKhau));
      assert.equal(
        (
          await admin.request(`/admin/users/${created.MaTaiKhoan}/edit`, {
            ...account,
            HoTen: 'Đổi tên',
            MatKhau: '',
          })
        ).status,
        303,
      );
      const [[edited]] = await connection.query(
        'SELECT * FROM TaiKhoan WHERE MaTaiKhoan=?',
        [created.MaTaiKhoan],
      );
      assert.equal(edited.MatKhau, created.MatKhau);
      assert.equal(
        (
          await admin.request(`/admin/users/${created.MaTaiKhoan}/edit`, {
            ...account,
            MatKhau: 'NewPass@123',
          })
        ).status,
        303,
      );
      const [[changed]] = await connection.query(
        'SELECT MatKhau FROM TaiKhoan WHERE MaTaiKhoan=?',
        [created.MaTaiKhoan],
      );
      assert.ok(await bcrypt.compare('NewPass@123', changed.MatKhau));
      assert.equal(
        (await admin.request('/admin/users/2/status', { status: 'Khoa' }))
          .status,
        303,
      );
      assert.equal(
        (await staff1.request('/staff/dashboard')).location,
        '/login?locked=1',
      );
      await staff1.request('/login');
      const locked = await staff1.request('/login', {
        username: 'staff1',
        password: 'TestPass@123',
      });
      assert.equal(locked.status, 401);
      assert.match(locked.html, /đã bị khóa/);
      assert.equal(
        (await admin.request('/admin/users/2/status', { status: 'HoatDong' }))
          .status,
        303,
      );
      await staff1.login('staff1');
      assert.equal(
        (await admin.request('/admin/users/1/status', { status: 'Khoa' }))
          .status,
        404,
      );
    },
  );
  await t.test('Thêm/sửa/khóa/mở sự cố, tìm kiếm và đăng xuất', async () => {
    const type = {
      TenLoai: 'Sự cố kiểm thử',
      MoTa: 'Mô tả',
      TrangThai: 'HoatDong',
    };
    assert.equal(
      (await admin.request('/admin/incident-types', type)).status,
      303,
    );
    const [[created]] = await connection.query(
      'SELECT * FROM LoaiSuCo ORDER BY MaLoai DESC LIMIT 1',
    );
    assert.equal(
      (
        await admin.request(`/admin/incident-types/${created.MaLoai}/edit`, {
          ...type,
          TenLoai: 'Đã sửa',
        })
      ).status,
      303,
    );
    assert.equal(
      (
        await admin.request(`/admin/incident-types/${created.MaLoai}/status`, {
          status: 'Khoa',
        })
      ).status,
      303,
    );
    assert.equal(
      (
        await admin.request(`/admin/incident-types/${created.MaLoai}/status`, {
          status: 'HoatDong',
        })
      ).status,
      303,
    );
    assert.equal(
      (
        await admin.request('/admin/incident-types', {
          ...type,
          TrangThai: 'invalid',
        })
      ).status,
      422,
    );
    assert.match(
      (await admin.request(`/admin/requests?search=${requestId}`)).html,
      new RegExp(`#${requestId}`),
    );
    assert.match(
      (await admin.request('/admin/requests?search=0901234567')).html,
      /Khách kiểm thử/,
    );
    assert.doesNotMatch(
      (await admin.request('/admin/requests?search=%27%20OR%201%3D1')).html,
      /Khách kiểm thử/,
    );
    assert.equal((await staff1.request('/logout', {})).status, 303);
    assert.equal((await staff1.request('/staff/dashboard')).location, '/login');
  });
});
