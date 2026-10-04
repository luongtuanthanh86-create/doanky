# Báo cáo kiểm thử bàn giao

## Thay đổi tra cứu theo số điện thoại

Đã bỏ ô mã yêu cầu bắt buộc. Tra cứu SĐT trả danh sách các yêu cầu cùng số, mới nhất trước, và cho chọn chi tiết. Đã chạy kiểm thử tích hợp trên database thử nghiệm riêng tại cổng 3306: 10 bài đạt, gồm tra cứu không có mã, chuẩn hóa +84, nhiều yêu cầu cùng SĐT, chọn yêu cầu cũ, không cho chọn mã thuộc SĐT khác và từ chối SĐT rỗng. Các mô tả tra cứu cặp mã/SĐT trong lịch sử kiểm thử bên dưới thuộc phiên bản trước.

## Kiểm tra lại ngày 15/09/2026

Người dùng báo bấm định vị không có phản hồi. Đã thêm trạng thái “Đang tìm vị trí…” ngay trên nút, chẩn đoán JavaScript/quyền/lỗi gốc ở mục “Kiểm tra lỗi định vị”, bắt lỗi khởi tạo Leaflet để không ngắt gắn sự kiện GPS, và đổi URL phiên bản script để tránh dùng bản cache cũ. Đã kiểm tra trên trình duyệt: nút đổi sang trạng thái đang tìm. Toàn bộ 16 bài kiểm thử đạt (gồm bài lỗi khởi tạo bản đồ vẫn lấy tọa độ qua callback). Chưa xác nhận vị trí thật của thiết bị; không coi kiểm thử callback là kiểm thử GPS phần cứng.

## Bổ sung sửa lỗi định vị

Sau phản hồi không lấy được vị trí, đã tái hiện lỗi timeout thực tế trong trình duyệt xem trước. Đã thêm fallback từ độ chính xác cao (10 giây) sang chế độ thường (20 giây), kiểm tra secure context, xử lý ngoại lệ và hướng dẫn quyền truy cập rõ ràng. Sáu bài kiểm thử frontend đạt, bao gồm fallback thành công, không thử lại khi bị từ chối quyền, không gán tọa độ giả khi thất bại và không khóa nút khi phát sinh ngoại lệ. Các bài này mô phỏng callback, không chứng minh thiết bị đã trả vị trí GPS thật.

Ngày kiểm tra: 13/09/2026. Đây là kết quả đã thực hiện, không phải cam kết mọi môi trường đều giống nhau.

## Môi trường

- Windows, Node.js 24.17.0, npm 11.13.0.
- Database thực: MariaDB 10.4.32 trong bộ XAMPP, giao thức MySQL, cổng 3307.
- Khởi tạo dữ liệu trong thư mục thử nghiệm riêng, không dùng thư mục dữ liệu XAMPP có sẵn.
- MySQL Community 8 chưa có sẵn để chạy kiểm tra trực tiếp; source dùng mysql2 và SQL tương thích MySQL 8.
- Express 5.2.1, EJS 3.1.10, mysql2 3.24.4, bcrypt 6.0.0, express-session 1.19.0, Bootstrap 5.3.8, Leaflet 1.9.4.

## Cài đặt và khởi động

| Kiểm tra | Kết quả |
| --- | --- |
| `npm install` | Thành công ở lần kiểm tra cuối, 128 package được audit, 0 lỗ hổng theo npm audit tại thời điểm chạy. |
| Cài bcrypt và thực thi hash | Thành công, dùng binary đóng gói của bcrypt. |
| Import `database.sql` | Thành công; ba bảng, FK, index, danh mục và yêu cầu demo được tạo. |
| `node scripts/create-demo-users.js` | Thành công, tạo admin và hai nhân viên. |
| `npm run dev` | Đã thử nhưng sandbox chặn tiến trình con của nodemon: `spawn EPERM`. Không kết luận lệnh này đã chạy thành công trong Codex. |
| `node app.js` | Thành công, server tại http://localhost:3000, kết nối database thành công. |
| Database không khả dụng | Thử kết nối tới cổng không có database: trang chủ trả HTTP 503 và thông báo, server không crash. |

Lúc đầu npm thiếu cache và chưa có quyền mạng. Sau khi được cấp quyền mạng, sandbox tiếp tục chặn install script; đã cài bằng `--ignore-scripts`, kiểm tra bcrypt hoạt động, rồi chạy lại `npm install` thành công. Source không thêm cấu hình `ignore-scripts` và không sửa nodemon để né sandbox.

## Kiểm thử tự động

Đã chạy sau khi định dạng source và EJS:

```sh
node --test --test-isolation=none tests/geolocation.test.js tests/integration.test.js
```

Kết quả: **12 bài kiểm thử đạt, 0 thất bại, 0 bỏ qua**. Gồm ba bài frontend, một bài tích hợp chính và tám bài con của bài tích hợp.

Các nhánh được kiểm tra:

1. GPS thành công gán tọa độ, hiện thông báo, mở lại nút.
2. GPS từ chối, không có vị trí, timeout, mã lỗi khác, thiếu Geolocation/Leaflet không crash.
3. Click bản đồ gán tọa độ, chặn submit thiếu vị trí, chi tiết thiếu tọa độ không crash.
4. Trang chủ/login/tracking và tài nguyên Bootstrap, Leaflet, marker trả 200; đường dẫn lạ trả 404.
5. Chưa đăng nhập bị chuyển về login khi truy cập staff/admin.
6. Thiếu/sai CSRF bị từ chối; form thiếu tên, sai số điện thoại, tọa độ rỗng/NaN/ngoài phạm vi, sai phương tiện, sự cố không tồn tại/đã khóa bị từ chối.
7. Gửi yêu cầu thật vào database, trạng thái chờ, chưa có nhân viên, thời gian có giá trị, chuẩn hóa SĐT +84.
8. Dữ liệu chứa thẻ script được escape ở EJS. Phiên khác không đọc được trang xác nhận chỉ bằng URL.
9. Tracking đúng mã nhưng sai SĐT không tiết lộ yêu cầu; đúng cặp mới có kết quả.
10. Đăng nhập sai và chuỗi SQL injection bị từ chối; session ID thay đổi sau khi đăng nhập.
11. Nhân viên không truy cập admin; admin không tham gia route thao tác staff.
12. Tất cả trang dashboard, danh sách, chi tiết và form admin/staff được render qua HTTP mà không lỗi EJS.
13. ID URL sai trả 400, mã không tồn tại trả 404.
14. Hai phiên nhân viên POST tiếp nhận cùng lúc: **một HTTP 303, một HTTP 409**, database chỉ có một người phụ trách.
15. Người không phụ trách, trạng thái ngoài whitelist, bỏ bước và lặp lại bước đã xử lý đều bị từ chối.
16. Đúng người phụ trách chuyển lần lượt đang xử lý → hoàn thành; nút cập nhật không còn ở trạng thái cuối.
17. Tracking sau hoàn thành hiển thị đúng trạng thái và tên nhân viên.
18. Admin thêm/sửa nhân viên; mật khẩu hash kiểm tra được bằng bcrypt.compare; trùng username bị từ chối.
19. Sửa nhân viên với mật khẩu trống giữ nguyên hash; mật khẩu mới tạo hash mới hoạt động.
20. Khóa nhân viên làm phiên cũ mất quyền ở request tiếp theo; đăng nhập tài khoản khóa bị từ chối; mở lại đăng nhập được.
21. Không thể khóa admin qua endpoint quản lý nhân viên hoặc tạo admin bằng cách sửa VaiTro trong form.
22. Thêm/sửa/khóa/mở sự cố; tìm kiếm mã và SĐT; chuỗi injection tìm kiếm không trả dữ liệu; đăng xuất hủy phiên.

Database test có tên sinh tự động và được xóa sau khi kết thúc. Không làm mất dữ liệu demo.

## Kiểm tra trình duyệt

- Trang chủ render được, form và bản đồ hiển thị cạnh nhau ở màn hình rộng.
- Đã phát hiện nền OpenStreetMap trả ảnh lỗi 403 do Referrer-Policy quá chặt; sửa thành `strict-origin-when-cross-origin` và kiểm tra lại nền bản đồ hiển thị thật.
- Điền form, chọn phương tiện/sự cố, nhập tọa độ demo, gửi thành công và nhận mã #2.
- Đăng nhập nhanvien1, vào danh sách, mở #2, tiếp nhận, bắt đầu xử lý, hoàn thành.
- Đăng xuất, tra cứu #2 + 0900000000; kết quả **Hoàn thành**, nhân viên **Nguyễn Minh An**.
- Marker Leaflet xuất hiện ở trang xác nhận và chi tiết; không ghi nhận console error trong bước kiểm tra gửi biểu mẫu.
- Kiểm tra viewport điện thoại 390 × 844: trang chủ và tra cứu có `scrollWidth = clientWidth = 375`, không tràn ngang trang. Phần còn lại là thanh cuộn của trình duyệt.

## Giới hạn đã ghi nhận

- GPS phần cứng và hộp thoại cấp quyền thực tế chưa được xác nhận; nhánh callback GPS đã được kiểm thử bằng mô phỏng. Luồng trình duyệt dùng tọa độ demo, không lấy vị trí cá nhân của người sử dụng máy.
- Chưa kiểm thử MySQL Community trực tiếp, tải lớn, nhiều tiến trình hoặc triển khai HTTPS production.
- Nền OpenStreetMap phụ thuộc kết nối mạng và dịch vụ bên ngoài. Bootstrap, Leaflet và ảnh marker phục vụ từ project.
- Session dùng MemoryStore phù hợp đồ án: khởi động lại server mất đăng nhập nhưng yêu cầu MySQL được giữ nguyên.
- Preview chạy bằng node trực tiếp vì giới hạn sandbox; trên máy cá nhân chạy theo README với MySQL và `npm run dev`.

## 02/10/2026 — Luồng kết nối và điều phối mới
- Chạy trên database thử riêng ở MariaDB 10.4, cổng 3317; không sửa dữ liệu thật ở cổng 3306. MySQL thật đang tắt tại thời điểm kiểm tra.
- geolocation.test.js: 7/7; integration.test.js: 10/10 gồm nhóm cha; support.test.js: 8/8 gồm nhóm cha. Tổng đầu ra test runner: 25 đạt, 0 lỗi.
- Luồng mới đã thử: tạo không cần thông tin, chống tạo trùng, bảo vệ phiên/media, chặn tệp sai, tiếp nhận đồng thời, bắt buộc xác minh thông tin trước phương án, chống giao trùng nhân viên, sửa phương án, xác nhận đúng phiên bản, SSE, đúng nhân viên và thứ tự trạng thái, khóa tài khoản.
- Đã thao tác trình duyệt thật qua hai origin localhost/127.0.0.1 để tách phiên: khách tạo phòng, gửi chat, lưu địa chỉ/xe/sự cố; nhân viên bật ca, tiếp nhận, gửi phương án; khách nhận cập nhật và đồng ý; nút xuất phát xuất hiện bên nhân viên.
- Kiểm tra cú pháp JavaScript và git diff --check đạt. npm test trong sandbox bị spawn EPERM; chạy từng file test trực tiếp với node đều đạt.
- Chưa thử ghi âm microphone và GPS trên thiết bị vật lý. Có giao diện xin quyền, thông báo lỗi và phương án nhập địa chỉ/nhắn tin. Không xác nhận kết quả GPS thật hoặc cuộc gọi điện thoại.
# Kiểm thử bổ sung gọi thoại — 02/10/2026

- `node tests/voice.test.js`: 3 kịch bản tích hợp đạt (4 mục tính cả nhóm), dùng CSDL thử riêng ở cổng 3317 và tự dọn. Kiểm tra CSRF, quyền phiên khách, người tiếp nhận, không lộ SDP cho nhân viên khác, chống chiếm cuộc gọi ở thẻ khác, gọi đồng thời, nhận/từ chối/kết thúc, cấm gọi trong phiên đã hủy.
- `node tests/voice-client.test.js`: 3 kiểm thử đạt với thiết bị/RTCPeerConnection mô phỏng. Kiểm tra từ chối microphone, offer/answer, tắt mic, dừng track, không tự bật mic khi có cuộc gọi đến.
- `node tests/support.test.js`: 8 mục đạt (gồm nhóm), chức năng hỗ trợ cũ không bị ảnh hưởng.
- Đã mở phòng hỗ trợ trong trình duyệt và kiểm tra giao diện nút gọi. Chưa kiểm chứng âm thanh thật giữa hai thiết bị hoặc kết nối qua TURN thực. Không coi kiểm thử mô phỏng là kiểm thử âm thanh thực tế.

## Sửa liên lạc 02/10/2026

Đã xác nhận hai thẻ ban đầu khác phòng (#4 và #1), nhân viên hết phiên. Kiểm thử UI gửi khách → nhân viên và nhân viên → khách đạt trong cùng phòng #4; sau sửa lưu session kiểm thử hai chiều lại trong phòng #7 đạt. Thêm nút tiếp nhận ở đầu trang, hướng dẫn mã phòng, đường dẫn đăng nhập lại. Microphone trong trình duyệt tích hợp hết thời gian chờ cấp quyền, chưa xác nhận âm thanh thật.

Kiểm thử voice.test.js đạt 5 mục (gồm nhóm), support.test.js đạt 8, integration.test.js đạt 10, voice-client.test.js đạt 3. Bao gồm lưu/đọc lại session qua hai instance độc lập, hết hạn và đăng xuất.

Đã khởi động lại tiến trình preview thật và tải lại cả hai thẻ: khách và nhân viên vẫn ở phòng #7, ô nhắn tin vẫn hoạt động, lịch sử tin nhắn còn nguyên.
