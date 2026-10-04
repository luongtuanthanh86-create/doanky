# Điều phối theo trạm, giống luồng giao hàng

1. Khách mở yêu cầu cứu hộ, gửi vị trí. Điều phối viên tiếp nhận và ghi nhận loại xe, sự cố qua trò chuyện.
2. Khi đã có vị trí, điều phối viên có thể giao trạm ngay; hệ thống tự tiếp nhận khách trong cùng thao tác. Điều phối viên chọn trạm trong danh sách sắp theo khoảng cách đường thẳng. Trạm gần nhất được gợi ý. Chọn trạm khác cần ghi lý do. Bấm Giao yêu cầu cho trạm.
3. Phụ trách trạm đăng nhập, chỉ thấy yêu cầu giao cho trạm mình. Chọn người, xe và gửi phương án để tiếp nhận trong một lần, hoặc từ chối có lý do. Trạm từ chối bị loại khỏi gợi ý cho yêu cầu này; điều phối viên giao trạm khác.
4. Form Cử xe cứu hộ gồm loại xe và tình trạng xe của khách, nhân viên sẵn sàng, xe thuộc trạm, phương án, thời gian dự kiến và chi phí. Không cần lưu thông tin xe ở một form khác trước. Bấm Nhận yêu cầu & gửi phương án. Người hoặc xe đang phục vụ yêu cầu khác không thể nhận thêm.
5. Khách đồng ý phương án. Nhân viên được cử đăng nhập, xác nhận xuất phát → đã đến → hoàn thành. Khách thấy tên trạm, xe, nhân viên và tiến độ trực tiếp. Thời gian dự kiến do trạm nhập, chưa có theo dõi GPS hành trình.

Admin vào Điểm cứu hộ để phân công tài khoản vào trạm, đánh dấu người phụ trách, thêm xe và tạm ngừng xe. Tài khoản nhân viên không thuộc trạm làm điều phối viên. Khi nhân viên trạm hết ca, tắt Sẵn sàng nhận điều phối. Không thể chuyển trạm một nhân viên đang phục vụ yêu cầu.

## Dữ liệu mẫu để trình diễn

Chạy `npm run seed:stations` một lần. Script thêm năm trạm mẫu, mỗi trạm một phụ trách, một nhân viên hiện trường và một xe mẫu. Không sửa mật khẩu tài khoản đã có.

Mật khẩu tất cả tài khoản mẫu mới tạo: `Tram@1234`.

| Khu vực | Phụ trách trạm | Nhân viên hiện trường |
|---|---|---|
| Pháp Vân | tram_phapvan | nv_phapvan |
| Hòa Lạc | tram_hoalac | nv_hoalac |
| Hà Nội–Hải Phòng | tram_hanoihaiphong | nv_hanoihaiphong |
| CT3 Trung Văn | tram_trungvan | nv_trungvan |
| Cầu Vĩnh Tuy | tram_vinhtuy | nv_vinhtuy |

Toàn bộ trạm, xe, biển số và tài khoản này là dữ liệu minh họa. Nhập cơ sở thực để sử dụng thực tế. Khoảng cách hiện tính đường thẳng; điều phối viên cần kiểm tra chiều đường và khả năng phục vụ. Khi có trạm thật đang hoạt động, trạm mẫu không được dùng để gợi ý.

Yêu cầu đã tồn tại trước bản cập nhật giữ quy trình cũ; khi giao trạm sẽ chuyển sang quy trình mới. Yêu cầu mới luôn cần giao trạm trước khi cử xe.

## Chạy bản cập nhật

Trong terminal đang chạy website, nhấn Ctrl+C rồi chạy `npm run dev`. Nếu báo EADDRINUSE, mở PowerShell trên máy và chạy:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ }
cd "C:\bt doan\cuuho-giaothong"
npm run dev
```

Lệnh trên dừng chương trình đang dùng cổng 3000 của website. Bật MySQL trong XAMPP trước khi chạy. Khi chạy bản ZIP trên máy khác: tạo `.env` từ `.env.example`, import `database.sql`, chạy `npm install`, `npm run seed`, `npm run seed:stations`, rồi `npm run dev`. Các bảng mới tự được cập nhật khi khởi động.

Thanh tiến độ hiển thị năm bước: Yêu cầu → Giao trạm → Cử xe → Đang hỗ trợ → Hoàn thành. Tiêu đề vẫn nêu rõ khi đang chờ khách xác nhận hoặc nhân viên đang đến.

## Tự gửi vị trí khi gọi
Khách bấm **Gọi thoại**: web xin quyền định vị, lấy tọa độ và tự gửi cho người tiếp nhận. Không cần bấm thêm Gửi vị trí. Cuộc gọi vẫn thiết lập trong lúc chờ GPS; lỗi định vị hiện riêng và có thể gửi vị trí thủ công. Cần cho phép microphone và vị trí trên localhost hoặc HTTPS. Khi đã giao trạm, giữ điểm đã giao; liên hệ điều phối nếu cần đổi điểm. Các thông tin xe, sự cố, điện thoại và địa chỉ không bị xóa khi tự gửi GPS.
