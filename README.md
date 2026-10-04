# CỨU HỘ VIỆT

Đồ án: **Xây dựng website hỗ trợ yêu cầu cứu hộ giao thông tích hợp bản đồ**.

Người gặp sự cố gửi thông tin cùng vị trí mà không cần tài khoản. Nhân viên đăng nhập, tiếp nhận và xử lý. Người dùng tra cứu chỉ bằng **số điện thoại**. Nếu có nhiều yêu cầu, danh sách xếp mới nhất trước và cho chọn xem chi tiết. Quản trị viên xem toàn bộ yêu cầu và quản lý nhân viên, loại sự cố.

## 1. Công nghệ và yêu cầu máy

- HTML5, CSS3, Bootstrap 5, JavaScript thuần.
- Node.js **20 trở lên**, Express 5, EJS.
- MySQL **8.0 trở lên**, truy vấn SQL trực tiếp bằng `mysql2/promise`.
- `express-session`, `bcrypt`, `dotenv`, `nodemon`.
- Leaflet và dữ liệu nền OpenStreetMap; Browser Geolocation API.
- Windows/macOS/Linux; khoảng 500 MB trống ngoài dung lượng cài Node.js/MySQL.
- Trình duyệt Chrome, Edge hoặc Firefox hiện đại. Internet để cài package và tải nền bản đồ.

Bootstrap và Leaflet được phục vụ từ `node_modules`, không phụ thuộc CDN. Không sử dụng React, ORM, API Google Maps, dịch vụ trả phí hoặc các tính năng ngoài phạm vi đề tài.

## 2. Cài Node.js và MySQL

1. Tải Node.js LTS từ [nodejs.org](https://nodejs.org/en/download), cài cùng npm. Mở terminal mới rồi kiểm tra:

   ```sh
   node --version
   npm --version
   ```

2. Cài MySQL Community Server từ [trang MySQL](https://dev.mysql.com/downloads/mysql/). Ghi nhớ tài khoản, mật khẩu và cổng đã chọn. Khởi động dịch vụ MySQL trước khi chạy website.
3. Có thể dùng MySQL Workbench hoặc công cụ SQL khác để nhập schema. Nếu dùng XAMPP, lưu ý thành phần ghi tên “MySQL” thường là MariaDB; phần kiểm tra thực tế của bản bàn giao dùng MariaDB 10.4.32 đi kèm XAMPP. Source SQL được viết tương thích MySQL 8; chưa chạy xác nhận trên MySQL Community trong môi trường này.

## 3. Chạy trên máy của bạn

Mở terminal **trong thư mục `cuuho-giaothong`**, nơi có `package.json`.

### Bước 1 — Cài package

```sh
npm install
```

Nếu PowerShell chặn `npm.ps1`, dùng `npm.cmd install` và `npm.cmd run dev`, hoặc mở Command Prompt. Không cần thay đổi chính sách bảo mật hệ thống.

### Bước 2 — Tạo `.env`

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```sh
cp .env.example .env
```

Sửa thông tin cho khớp MySQL của máy:

```dotenv
PORT=3000
NODE_ENV=development
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=mat_khau_mysql_cua_ban
DB_NAME=cuuho_giaothong
SESSION_SECRET=chuoi_ngau_nhien_rieng_dai_it_nhat_32_ky_tu
```

Nếu MySQL root không có mật khẩu thì để `DB_PASSWORD=`. Không đưa `.env` lên Git; file đã nằm trong `.gitignore`. Có thể tạo secret bằng:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Bước 3 — Import database

Đăng nhập MySQL:

```sh
mysql -u root -p
```

Trong dấu nhắc `mysql>`:

```sql
SOURCE C:/duong-dan/cuuho-giaothong/database.sql;
SHOW TABLES FROM cuuho_giaothong;
```

Thay đường dẫn bằng vị trí thật. Trên Windows nên dùng dấu `/` trong lệnh `SOURCE`. Hoặc mở `database.sql` trong MySQL Workbench rồi chạy toàn bộ script. Với phpMyAdmin, mở tab **Import**, chọn file `database.sql` và thực hiện nhập.

`database.sql` tự tạo database `cuuho_giaothong`, ba bảng, khóa ngoại, chỉ mục, năm loại sự cố và một yêu cầu mẫu. Script không có `DROP DATABASE`/`DROP TABLE`; nhập lại giữ các bản ghi đã có. Nếu đổi `DB_NAME`, phải đổi cả tên database trong SQL trước khi import.

### Bước 4 — Tạo tài khoản demo

```sh
npm run seed
```

Tương đương `node scripts/create-demo-users.js`. Bước này **bắt buộc ở lần cài đầu tiên** để đăng nhập được. Script gọi `bcrypt.hash()` thật và lưu hash; không chèn mật khẩu thô vào database. Chạy lại sẽ bỏ qua username đã tồn tại, không tự đặt lại mật khẩu.

| Vai trò       | Tên đăng nhập | Mật khẩu demo  |
| ------------- | ------------- | -------------- |
| Quản trị viên | `admin`       | `Admin@123`    |
| Nhân viên 1   | `nhanvien1`   | `NhanVien@123` |
| Nhân viên 2   | `nhanvien2`   | `NhanVien@123` |

### Bước 5 — Khởi động

```sh
npm run dev
```

Mặc định: **[http://localhost:3000](http://localhost:3000)**. Nếu có `PORT` trong `.env`, ứng dụng ưu tiên giá trị đó.

Chạy không dùng nodemon:

```sh
npm start
```

Tương đương `node app.js`. Nhấn `Ctrl+C` để dừng. Database vẫn cần hoạt động.

## 4. Bản xem trước trên máy hiện tại

Trong phiên bàn giao, ứng dụng chạy tại `http://localhost:3000`, kết nối database thử nghiệm riêng ở `127.0.0.1:3307`. Dữ liệu nằm trong `work/mysql-data` bên ngoài source project, không chỉnh sửa thư mục dữ liệu XAMPP gốc. File `.env` trong thư mục source hiện tại đã được cấu hình cho bản xem trước này.

File ZIP không chứa `.env` hoặc dữ liệu database thử nghiệm. Khi chuyển máy hoặc mở lại sau khi tiến trình xem trước đã dừng, thực hiện đầy đủ các bước cài đặt phía trên với MySQL của bạn; không chỉ chạy `npm install` khi chưa tạo database.

Môi trường sandbox Codex chặn tiến trình con của nodemon (`spawn EPERM`), nên preview được chạy bằng `node app.js`. `npm run dev` vẫn có đúng giá trị `nodemon app.js`; cần chạy trên terminal máy thông thường để dùng tự khởi động lại khi sửa file.

## 5. Chức năng và các trang

| Đường dẫn               | Chức năng                                                     |
| ----------------------- | ------------------------------------------------------------- |
| `/`                     | Gửi cứu hộ, chọn sự cố, lấy GPS/chọn bản đồ/nhập tọa độ       |
| `/success`              | Xác nhận yêu cầu vừa gửi, chỉ mở trong phiên đã gửi           |
| `/tracking`             | Tra cứu bằng SĐT, chọn yêu cầu từ danh sách; không đưa SĐT vào URL |
| `/login`                | Đăng nhập chung cho nhân viên/admin                           |
| `/staff/dashboard`      | Bốn card thống kê toàn hệ thống                               |
| `/staff/requests`       | Danh sách, lọc trạng thái, phân trang 20 dòng                 |
| `/staff/requests/:id`   | Chi tiết, bản đồ và thao tác xử lý đúng quyền                 |
| `/admin/dashboard`      | Tổng yêu cầu, bốn trạng thái, tổng nhân viên, tổng loại sự cố |
| `/admin/requests`       | Xem toàn bộ, lọc trạng thái, tìm chính xác mã hoặc SĐT        |
| `/admin/users`          | Thêm/sửa, đặt mật khẩu, khóa/mở nhân viên                     |
| `/admin/incident-types` | Thêm/sửa, khóa/mở loại sự cố                                  |

Quản lý nhân viên chỉ tạo/sửa vai trò `nhanvien`; vai trò admin được tạo bằng script seed. Admin không tham gia tiếp nhận hoặc sửa trạng thái cứu hộ. Không xóa nhân viên/sự cố để bảo toàn khóa ngoại và dữ liệu yêu cầu cũ.

Số điện thoại hỗ trợ `0` + 9 chữ số hoặc `+84` + 9 chữ số, chuẩn hóa về dạng bắt đầu bằng `0`. Không tự xóa khoảng trắng ở giữa hay dấu gạch. Tra cứu chấp nhận cả hai dạng. Bộ lọc admin tìm SĐT chính xác theo dạng đã lưu.

## 6. Luồng demo khi bảo vệ

1. Mở `/`. Nhập tên, SĐT, phương tiện, sự cố. Nhấn **Lấy vị trí hiện tại**, cấp quyền và kiểm tra marker. Nếu GPS không khả dụng, chạm bản đồ hoặc nhập `10.7769`, `106.7009` để demo.
2. Nhấn **Gửi yêu cầu cứu hộ**. Ghi lại mã và SĐT trên trang xác nhận.
3. Đăng nhập `nhanvien1`. Vào **Yêu cầu cứu hộ**, mở đúng mã vừa tạo và xem bản đồ.
4. Nhấn **Tiếp nhận yêu cầu** → **Đã tiếp nhận**.
5. Nhấn **Bắt đầu xử lý** → **Đang xử lý**.
6. Nhấn **Hoàn thành** → **Hoàn thành**; nút cập nhật biến mất.
7. Mở `/tracking`, nhập SĐT. Chọn yêu cầu trong danh sách để xem trạng thái **Hoàn thành** và tên nhân viên.
8. Đăng xuất, đăng nhập `admin`. Kiểm tra dashboard, tìm yêu cầu, thêm/sửa/khóa/mở nhân viên và loại sự cố.
9. Demo kiểm soát: dùng trình duyệt khác/ẩn danh cho `nhanvien2`. Thử nhận một yêu cầu đã được nhận; server từ chối. Khóa nhân viên rồi dùng phiên cũ; lần truy cập tiếp theo bị đăng xuất.

Trạng thái duy nhất:

```text
ChoTiepNhan → DaTiepNhan → DangXuLy → HoanThanh
Chờ tiếp nhận → Đã tiếp nhận → Đang xử lý → Hoàn thành
```

Không có hủy yêu cầu, đổi người phụ trách hoặc quay lùi trạng thái. Nếu khóa nhân viên đang phụ trách, phải mở lại tài khoản để người đó tiếp tục quy trình; hệ thống không tự chuyển người phụ trách.

## 7. Cấu trúc source và gợi ý giải thích

```text
cuuho-giaothong/
├── app.js                       # Khởi tạo Express, session, routes, 404/error
├── config/database.js           # mysql2/promise connection pool
├── lib/
│   ├── helpers.js               # Whitelist, validation, định dạng
│   └── requests.js              # SQL đọc yêu cầu, lọc và thống kê
├── middleware/
│   ├── auth.js                  # requireLogin / requireAdmin / requireStaff
│   └── security.js              # CSRF và giới hạn thao tác theo IP
├── routes/
│   ├── public.js                # Gửi, xác nhận và tra cứu
│   ├── auth.js                  # Đăng nhập / đăng xuất
│   ├── staff.js                 # Tiếp nhận, cập nhật đúng thứ tự
│   └── admin.js                 # Quản lý nhân viên và sự cố
├── views/
│   ├── partials/                # Header, footer, bảng, dashboard, thông tin yêu cầu
│   ├── index.ejs / success.ejs / tracking.ejs / login.ejs / error.ejs
│   ├── staff/                  # Dashboard, requests, request-detail
│   └── admin/                  # Dashboard, requests, users, incident-types, forms
├── public/
│   ├── css/style.css
│   ├── js/app.js                # Leaflet, marker, GPS và lỗi GPS
│   └── images/favicon.svg
├── scripts/create-demo-users.js
├── tests/                      # Kiểm thử HTTP/database và các nhánh GPS
├── database.sql
├── package.json / package-lock.json
├── .env.example / .gitignore
└── README.md / KIEM-THU.md
```

**Cách đọc code:** bắt đầu ở `app.js` → `routes/public.js` → `lib/helpers.js` → `routes/staff.js` → `middleware/auth.js` → `routes/admin.js`. EJS render HTML ở server; JavaScript trình duyệt chỉ xử lý bản đồ, định vị và kiểm tra nhập liệu. Không có SPA hoặc API realtime.

### Chống hai người tiếp nhận cùng một yêu cầu

```sql
UPDATE YeuCauCuuHo
SET MaNhanVien=?, TrangThai='DaTiepNhan', ThoiGianCapNhat=NOW()
WHERE MaYeuCau=? AND TrangThai='ChoTiepNhan' AND MaNhanVien IS NULL;
```

Đây là một thao tác nguyên tử trên InnoDB. Người thắng cập nhật được một dòng. Người còn lại nhận `affectedRows = 0`, server trả HTTP 409. Không dùng cách `SELECT` rồi `UPDATE` vô điều kiện.

Khi cập nhật trạng thái, SQL đồng thời yêu cầu đúng `MaNhanVien`, đúng trạng thái trước đó và đúng mã. Tên trạng thái đích được kiểm tra trong whitelist. Do vậy sửa HTML hoặc gửi POST thủ công vẫn không bỏ qua được quy trình.

### Bảo mật ở mức đồ án

- Mật khẩu bcrypt cost 12; kiểm tra giới hạn 72 byte để tránh cắt mật khẩu âm thầm.
- Đổi session ID khi đăng nhập, hủy session khi đăng xuất. Cookie `httpOnly`, `sameSite=lax`.
- Kiểm tra lại trạng thái tài khoản từ database ở mỗi lượt truy cập trang nhân viên/admin.
- Tất cả dữ liệu đầu vào SQL qua placeholder `?`. OFFSET được tính từ số nguyên ở server.
- EJS escape dữ liệu bằng `<%=`. `<%-` chỉ dùng include nội bộ hoặc chuỗi HTML tĩnh.
- POST cần CSRF token. Giới hạn đăng nhập 15 lần/10 phút, gửi cứu hộ 20 lần/10 phút, tra cứu 40 lần/10 phút theo IP.
- Không hiển thị stack trace cho người dùng. Lỗi database có trang thông báo.
- Tracking chỉ yêu cầu SĐT theo thay đổi nghiệp vụ. Người biết SĐT có thể xem các yêu cầu của số đó; không có OTP xác minh quyền sở hữu. Mã chọn chi tiết luôn được đối chiếu với SĐT ở server. Trang xác nhận vẫn yêu cầu phiên đã gửi.

Session được lưu trong bảng PhienTruyCap trên MySQL, giữ được khi khởi động lại nếu SESSION_SECRET không đổi. Giới hạn truy cập và signaling cuộc gọi vẫn dùng bộ nhớ của một tiến trình. Nếu triển khai production cần HTTPS, secret riêng và cấu hình proxy phù hợp. `NODE_ENV=production` bật cookie secure nên không đăng nhập qua HTTP localhost ở chế độ này.

## 8. Kiểm thử

Với database đang chạy và tài khoản DB có quyền tạo/xóa database kiểm thử:

```sh
npm test
```

Bài test tự sinh database riêng `cuuho_test_<pid>_<timestamp>`, chạy schema và xóa đúng database đó khi kết thúc. Không xóa database ứng dụng. Không có dữ liệu người thật trong bài test.

Trên Node.js 24 trong môi trường chặn tiến trình con, chạy cùng tiến trình:

```sh
node --test --test-isolation=none tests/geolocation.test.js tests/integration.test.js
```

Chi tiết kết quả thực tế và giới hạn kiểm thử xem `KIEM-THU.md`. Bài test GPS mô phỏng callback thành công/từ chối/hết thời gian; kiểm tra GPS phần cứng vẫn cần trình duyệt và quyền vị trí thực tế.

## 9. Xử lý lỗi thường gặp

Nút lấy vị trí thử chế độ chính xác cao trong 10 giây. Nếu không có vị trí hoặc hết thời gian, ứng dụng tự thử chế độ thường thêm 20 giây (vẫn dùng Browser Geolocation API). Không tự điền tọa độ demo khi thất bại. Nếu vẫn timeout trong khung xem trước, mở `http://localhost:3000` bằng Chrome/Edge trên cùng máy, cho phép website truy cập vị trí và kiểm tra dịch vụ vị trí của hệ điều hành. Bản đồ hiển thị được không đồng nghĩa trình duyệt cung cấp được vị trí thiết bị.

| Hiện tượng                                 | Cách xử lý                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `ECONNREFUSED`                             | Khởi động MySQL, kiểm tra DB_HOST và DB_PORT.                                                                          |
| `ER_ACCESS_DENIED_ERROR`                   | Kiểm tra DB_USER và DB_PASSWORD.                                                                                       |
| `ER_BAD_DB_ERROR` / thiếu bảng             | Import database.sql, kiểm tra DB_NAME.                                                                                 |
| Đăng nhập mẫu không được                   | Chạy `npm run seed`; script không đổi mật khẩu tài khoản đã có.                                                        |
| `EADDRINUSE`                               | Cổng 3000 đã được ứng dụng khác dùng; đổi PORT rồi mở đúng URL.                                                        |
| `spawn EPERM` với nodemon                  | Tiến trình con bị môi trường chặn; dùng `node app.js` hoặc terminal bình thường.                                       |
| Báo phiên biểu mẫu hết hạn                 | Tải lại trang để nhận CSRF token mới, thường sau khi server khởi động lại.                                             |
| GPS bị từ chối                             | Cấp lại quyền vị trí cho localhost trong trình duyệt, thử lại hoặc chọn bản đồ/nhập tọa độ.                            |
| GPS không chạy từ máy khác qua HTTP        | Geolocation cần secure context: dùng localhost hoặc HTTPS.                                                             |
| Nền bản đồ trống                           | Kiểm tra Internet và truy cập OpenStreetMap; GPS/nhập tọa độ vẫn dùng được.                                            |
| Nền bản đồ báo 403                         | Không chặn Referer; ứng dụng đã đặt `strict-origin-when-cross-origin`. Kiểm tra tiện ích trình duyệt/mạng nếu vẫn lỗi. |
| Tên sự cố cũ thay đổi sau khi sửa danh mục | Yêu cầu tham chiếu danh mục qua khóa ngoại, tên được JOIN lúc xem.                                                     |

Lưu ý thời gian do `NOW()` của server database cung cấp. Khi demo tại Việt Nam, cấu hình múi giờ hệ điều hành/database nhất quán. Tọa độ được gửi khi khách bấm Gọi thoại (sau khi cấp quyền vị trí), hoặc gửi thủ công từ bản đồ; không có theo dõi GPS liên tục.

## 10. Tài liệu tham khảo

- [Express session](https://expressjs.com/en/resources/middleware/session.html): session, cookie và regenerate.
- [MySQL affected rows](https://dev.mysql.com/doc/c-api/8.0/en/mysql-affected-rows.html): kết quả thao tác cập nhật.
- [Leaflet](https://leafletjs.com/reference.html): bản đồ và marker.
- [Chính sách OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/): attribution, Referer và bộ nhớ đệm.

Không tải bản đồ hàng loạt, không thêm proxy để né chính sách của nhà cung cấp. Đường dẫn Google Maps chỉ mở trang bản đồ, không gọi Google Maps JavaScript API.

## Cập nhật hỗ trợ trực tiếp (02/10/2026)
Trang chủ mới kết nối nhanh, phòng chat/ảnh/ghi âm, vị trí, ca trực và điều phối có xác nhận chi phí. Xem `HUONG-DAN-HO-TRO-MOI.md` để cập nhật database, cấu hình hotline và demo hai vai trò. Các mô tả ba bảng/bốn trạng thái ở phần cũ chỉ áp dụng luồng biểu mẫu trước đây.

## Bản cập nhật 05/10/2026
- Điều phối trạm gần nhất quanh Hà Nội; trạm cử nhân viên và xe của trạm.
- Quy trình 5 bước: Yêu cầu → Giao trạm → Cử xe → Đang hỗ trợ → Hoàn thành.
- Khách bấm Gọi thoại sẽ tự lấy và gửi vị trí. GPS lỗi không chặn cuộc gọi; vị trí đã giao trạm được giữ nguyên.
- Sau khi tạo `.env` từ `.env.example` và import `database.sql`, chạy `npm install`, `npm run migrate`, `npm run seed`, `npm run seed:stations`, rồi `npm run dev`.
- Xem `DIEU-PHOI-TRAM.md` và `GOI-THOAI.md` để thử các vai trò. Chỉ có `.env.example` trong kho; tự cấu hình mật khẩu database và SESSION_SECRET trên máy chạy.
