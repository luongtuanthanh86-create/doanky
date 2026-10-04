# Phiên bản hỗ trợ trực tiếp — 02/10/2026

## Chạy trên máy của bạn
1. Bật MySQL trong XAMPP như trước. Không import đè hay xóa dữ liệu cũ.
2. Mở terminal trong `C:\bt doan\cuuho-giaothong`.
3. Chạy `npm run migrate` để thêm các bảng hỗ trợ mới (chạy lại an toàn).
4. Chạy `npm run dev`, mở http://localhost:3000.
Ứng dụng cũng tự kiểm tra/tạo các bảng mới khi `node app.js` khởi động. Cần database cũ đã được import và tài khoản MySQL có quyền CREATE TABLE.

## Cấu hình dịch vụ trong .env
Thêm các biến sau và điền thông tin thật:
```
RESCUE_HOTLINE=
RESCUE_AREA=
RESCUE_HOURS=
```
Hotline nhận số 9–15 chữ số, có thể bắt đầu bằng +. Để trống sẽ không tạo nút gọi số giả. Ví dụ khu vực: các quận thực sự phục vụ; giờ trực: lịch nhân viên thực sự trực. Khởi động lại ứng dụng sau khi sửa.

## Demo bằng hai phiên trình duyệt riêng
- Khách: cửa sổ ẩn danh, vào trang chủ, bấm Kết nối cứu hộ. Không phải đăng nhập hay nhập thông tin trước.
- Nhân viên: cửa sổ thường, đăng nhập nhanvien1 / NhanVien@123 (nếu chưa đổi). Vào Tiếp nhận & điều phối, điền khu vực/khả năng, bật Sẵn sàng, Cập nhật ca trực và bật âm báo.
- Khách gửi lời nhắn, ảnh hoặc ghi âm, chia sẻ tọa độ hoặc địa chỉ. Nhân viên cũng có thể ghi nhận các thông tin này sau khi tiếp nhận.
- Nhân viên bấm Tiếp nhận & trao đổi; xác minh loại xe, tình trạng và vị trí. Chọn nhân viên hiện trường còn sẵn sàng, nhập phương án, số phút đến dự kiến, giá và phạm vi chi phí rồi gửi.
- Khách xem và Đồng ý phương án hoặc Cần trao đổi lại. Chỉ nhân viên được điều phối/admin mới được cập nhật: Xuất phát → Đã đến → Hoàn thành.
- Một nhân viên có thể kiêm tiếp nhận và hiện trường. Không có thuật toán tự tìm người gần nhất: người trực lựa chọn dựa trên khu vực và khả năng đã khai báo.
- Biểu mẫu cũ còn tại /request-form, dữ liệu cũ ở danh sách quản trị/nhân viên và /tracking. Các phiên hỗ trợ mới theo dõi trong phòng riêng trên trình duyệt, không tra cứu công khai bằng số điện thoại.

## Kỹ thuật và giới hạn
- Express/EJS/MySQL như cũ; SSE báo thay đổi ngay, kết nối lại tự động, tải lại dữ liệu định kỳ 15 giây dự phòng. Ca trực hết hiệu lực sau 60 giây không heartbeat.
- Ba bảng mới: HoTroNhanh, HoTroTinNhan, CaTrucCuuHo; không sửa/xóa ba bảng cũ. Chat, phương án và lịch sử trạng thái lưu MySQL.
- Guest session là quyền truy cập phòng, không phải mã yêu cầu dễ đoán. Cùng phiên có một yêu cầu chưa kết thúc; nhấn lại nút kết nối mở phiên đang có.
- Phiên đăng nhập và phòng khách lưu trong bảng PhienTruyCap của MySQL, thời hạn 8 giờ. Giữ SESSION_SECRET cố định trong .env để phiên còn hiệu lực sau khi khởi động lại server. Cuộc gọi đang diễn ra vẫn ngắt khi server khởi động lại; có thể gọi lại trong phòng cũ.
- SSE/event bus và giới hạn thao tác dùng một tiến trình. Triển khai nhiều tiến trình cần pub/sub và session store chung.
- Gọi ngay mở ứng dụng điện thoại qua tel:, không phải cuộc gọi VoIP trong web. Ghi âm là tin nhắn âm thanh gửi sau khi nhấn Gửi; không phải gọi thoại trực tiếp.
- GPS và microphone cần quyền người dùng, localhost hoặc HTTPS. Nếu không lấy GPS, dùng bản đồ hoặc địa chỉ. Không giả lập vị trí hiện tại; bản đồ khởi đầu chỉ là vùng tham khảo.
- Ảnh lớn được giảm kích thước trước khi gửi; tệp tối đa 512 KB để tương thích MySQL XAMPP với max_allowed_packet=1M. Ghi âm tối đa 45 giây, ưu tiên 24 kbps. Kiểm tra chữ ký tệp và quyền truy cập trước khi trả media.
- Phòng hiển thị 100 tin gần nhất, tối đa 500 tin/phiên. Bảng điều phối hiển thị tối đa 150 phiên gần nhất, chỉ giữ phiên đã kết thúc trong danh sách 24 giờ (dữ liệu không bị xóa).
- Chưa kiểm chứng GPS/microphone trên thiết bị thật; kiểm tra quyền trình duyệt khi demo. Cần có nhân viên trực thực tế để đáp ứng nhanh; giao diện không cam kết tự động có người đến.

## Kiểm thử
Bộ test gồm định vị biểu mẫu cũ, tích hợp luồng cũ và hỗ trợ mới. Chạy `npm test` khi MySQL đang bật. Test tự tạo database `cuuho_test_*` / `cuuho_support_test_*` riêng và chỉ xóa các database test đó.
Nếu môi trường chặn test runner tạo tiến trình (`spawn EPERM`), chạy lần lượt:
```
node tests/geolocation.test.js
node tests/integration.test.js
node tests/support.test.js
```
Các bài test tích hợp cần quyền tạo/xóa database thử. Không dùng DB sản phẩm làm DB thử.
# Bổ sung gọi thoại

Phòng hỗ trợ đã có **Gọi thoại**, **Nghe cuộc gọi**, **Tắt mic** và **Kết thúc** qua Internet. Xem `GOI-THOAI.md` để thử giữa khách/nhân viên và cấu hình HTTPS/TURN khi triển khai.

