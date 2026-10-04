const fs = require("node:fs");
const path = require("node:path");
async function migrate(pool) {
  const sql = fs.readFileSync(
    path.join(__dirname, "../support-schema.sql"),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await pool.query(statement);
  const [columns] = await pool.query("SHOW COLUMNS FROM HoTroNhanh");
  for (const [name, definition] of Object.entries({
    stationId: "INT NULL",
    stationVehicleId: "INT NULL",
    routingMode: "VARCHAR(12) NOT NULL DEFAULT 'legacy'",
  })) {
    if (!columns.some((c) => c.Field === name))
      await pool.query(
        "ALTER TABLE HoTroNhanh ADD COLUMN " + name + " " + definition,
      );
  }
}
if (require.main === module) {
  const pool = require("../config/database");
  migrate(pool)
    .then(() =>
      console.log("Đã cập nhật bảng hỗ trợ. Dữ liệu cũ được giữ nguyên."),
    )
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
module.exports = migrate;
