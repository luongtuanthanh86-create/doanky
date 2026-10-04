const pool = require("../config/database");
const bcrypt = require("bcrypt");
async function main() {
  await require("./migrate-support")(pool);
  const points = [
    ["phapvan", "Pháp Vân", 20.968, 105.841],
    ["hoalac", "Hòa Lạc", 21.005, 105.526],
    ["hanoihaiphong", "Hà Nội–Hải Phòng", 20.973, 105.945],
    ["trungvan", "CT3 Trung Văn", 20.996, 105.793],
    ["vinhtuy", "cầu Vĩnh Tuy", 21, 105.891],
  ];
  const hash = await bcrypt.hash("Tram@1234", 10);
  for (const [key, name, lat, lng] of points) {
    await pool.execute(
      "INSERT IGNORE INTO DiemCuuHo(demoKey,name,address,lat,lng,isDemo) VALUES(?,?,?,?,?,1)",
      [
        key,
        "MẪU – Cứu hộ " + name,
        "Vị trí minh họa gần " + name + ", không phải cơ sở thực",
        lat,
        lng,
      ],
    );
    const [[station]] = await pool.execute(
      "SELECT id,isDemo FROM DiemCuuHo WHERE demoKey=?",
      [key],
    );
    if (!station.isDemo) continue;
    for (const [prefix, manager] of [
      ["tram_", 1],
      ["nv_", 0],
    ]) {
      const username = prefix + key;
      const [[existing]] = await pool.execute(
        "SELECT MaTaiKhoan id FROM TaiKhoan WHERE TenDangNhap=?",
        [username],
      );
      if (existing) {
        console.log("Giữ nguyên tài khoản có sẵn: " + username);
        continue;
      }
      const [r] = await pool.execute(
        "INSERT INTO TaiKhoan(TenDangNhap,MatKhau,HoTen,VaiTro) VALUES(?,?,?,'nhanvien')",
        [
          username,
          hash,
          "MẪU – " + (manager ? "Phụ trách " : "Nhân viên ") + name,
        ],
      );
      await pool.execute(
        "INSERT INTO NhanVienTram(accountId,stationId,manager) VALUES(?,?,?)",
        [r.insertId, station.id, manager],
      );
      await pool.execute(
        "INSERT INTO CaTrucCuuHo(accountId,available,capability) VALUES(?,1,'MẪU – Kích bình / kéo ô tô')",
        [r.insertId],
      );
      console.log("Đã tạo tài khoản mẫu: " + username);
    }
    await pool.execute(
      "INSERT IGNORE INTO XeCuuHoTram(stationId,name,plate,capability) VALUES(?,?,?,?)",
      [
        station.id,
        "MẪU – Xe kéo " + name,
        "MAU-" + key.toUpperCase(),
        "MẪU – Kéo ô tô / kích bình",
      ],
    );
  }
}
main()
  .catch((e) => {
    console.error(e.code || e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
