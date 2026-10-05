require("dotenv").config();
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const pool = require("./config/database");
const helpers = require("./lib/helpers");
const { csrf } = require("./middleware/security");
const app = express();
const production = process.env.NODE_ENV === "production";
if (
  production &&
  (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
)
  throw new Error("Cần SESSION_SECRET riêng dài ít nhất 32 ký tự.");
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Error pages must render even when body parsing or the session store fails.
app.use((req, res, next) => {
  Object.assign(res.locals, helpers, {
    user: null,
    currentPath: req.path,
    csrf: "",
    errors: [],
    values: {},
    flash: null,
  });
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/bootstrap",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist")),
);
app.use(
  "/vendor/leaflet",
  express.static(path.join(__dirname, "node_modules/leaflet/dist")),
);
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use("/support", express.json({ limit: "1mb" }));
app.use(express.json({ limit: "32kb" }));
app.use(
  session({
    store: new (require("./lib/mysql-session-store"))(pool),
    name: require("./lib/session-name"),
    secret:
      process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  // OpenStreetMap yêu cầu Referer hợp lệ; chỉ gửi origin khi tải nền bản đồ.
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  Object.assign(res.locals, helpers, {
    user: req.session.user || null,
    currentPath: req.path,
    errors: [],
    values: {},
    flash: req.session.flash || null,
  });
  delete req.session.flash;
  next();
});
app.use(csrf);
app.use("/support", require("./routes/support"));
app.get("/", (req, res, next) => {
  require("./routes/support")(req, res, next);
});
app.use("/", require("./routes/public"));
app.use("/", require("./routes/auth"));
app.use("/staff", require("./routes/staff"));
app.use("/admin", require("./routes/admin"));
app.use((req, res) =>
  helpers.fail(res, 404, "Không tìm thấy trang bạn yêu cầu."),
);
app.use((err, req, res, next) => {
  console.error("[Ứng dụng]", err.code || err.message);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/support/api/"))
    return res
      .status(err.status || 500)
      .json({
        error:
          err.status === 413
            ? "Tệp quá lớn. Vui lòng chọn ảnh hoặc ghi âm nhỏ hơn."
            : "Không thể thực hiện thao tác. Vui lòng thử lại.",
      });
  const unavailable = [
    "ECONNREFUSED",
    "ER_ACCESS_DENIED_ERROR",
    "ER_BAD_DB_ERROR",
  ].includes(err.code);
  helpers.fail(
    res,
    unavailable ? 503 : err.status || 500,
    unavailable
      ? "Chưa kết nối được cơ sở dữ liệu. Vui lòng kiểm tra MySQL và cấu hình .env theo README."
      : "Không thể thực hiện thao tác lúc này. Vui lòng thử lại.",
  );
});
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = require("node:http").createServer(app);
  require("./scripts/migrate-support")(pool)
    .then(() => server.listen(port))
    .catch((err) => {
      console.error(
        "Không thể cập nhật dữ liệu hỗ trợ:",
        err.code || err.message,
      );
      process.exitCode = 1;
      pool.end();
    });
  server.on("listening", () =>
    console.log(`Cứu Hộ Việt: http://localhost:${port}`),
  );
  pool
    .query("SELECT 1")
    .then(() => console.log("Kết nối MySQL thành công."))
    .catch((err) =>
      console.error("MySQL chưa sẵn sàng:", err.code, "— xem README."),
    );
  server.on("error", (err) => {
    console.error("Không thể khởi động server:", err.code);
    process.exit(1);
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(() => pool.end().then(() => process.exit(0))),
    );
}
module.exports = app;
