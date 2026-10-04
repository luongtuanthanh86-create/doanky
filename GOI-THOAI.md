# Gọi thoại trong website

Khách bấm Kết nối cứu hộ ở trang chủ, rồi **Gọi thoại** trong phòng hỗ trợ. Trình duyệt hỏi quyền microphone; chọn Cho phép. Không cần số điện thoại hay cài thêm ứng dụng.

Nhân viên đăng nhập, bật chuông trên bảng điều phối và mở yêu cầu có dòng **Khách đang gọi**. Tiếp nhận yêu cầu, sau đó bấm **Nghe cuộc gọi** và cho phép microphone. Nhân viên tiếp nhận hoặc nhân viên được điều phối cũng có thể gọi lại từ phòng này. Có nút từ chối, bật/tắt mic và kết thúc. Khách và nhân viên phải giữ trang mở; website không nhận cuộc gọi nền khi trình duyệt đã đóng. Âm thanh chuông cần tương tác Bật chuông do giới hạn tự phát của trình duyệt.

## Chạy và triển khai

Không cần cài thư viện hoặc đổi cấu trúc dữ liệu. Khởi động lại `npm run dev` và tải lại trang sau cập nhật.

- Thử trên máy: localhost với hai trình duyệt/hồ sơ khác nhau; đăng nhập nhân viên ở một phía, phía còn lại là khách. Dùng tai nghe để tránh vọng âm.
- Hai thiết bị: website phải có **HTTPS** và địa chỉ truy cập được từ cả hai máy. Địa chỉ HTTP dạng IP mạng LAN không đủ quyền microphone ở các trình duyệt thông thường.
- Có STUN mặc định; kết nối qua NAT/4G hoặc tường lửa có thể cần **TURN**. Điền TURN_URL, TURN_USERNAME, TURN_PASSWORD trong `.env` bằng dịch vụ TURN thực của bạn rồi khởi động lại. Chưa có TURN thì không bảo đảm gọi được giữa mọi mạng. Không đưa mật khẩu TURN thật vào Git hoặc bản ZIP. Cấu hình TURN được cấp cho người tham gia có quyền; nên dùng thông tin ngắn hạn khi triển khai công khai.
- Bản đồ vẫn cần quyền vị trí riêng, không bị bật tự động khi gọi.

## Giới hạn kỹ thuật

WebRTC truyền âm thanh; máy chủ chỉ trao đổi offer/answer qua HTTPS, không lưu bản ghi âm. SDP có thể chứa địa chỉ mạng và chỉ cấp cho đúng người tham gia. Mỗi phòng chỉ có một cuộc gọi. Mỗi nhân viên chỉ tham gia một cuộc gọi tại một thời điểm; một thẻ khác không được chiếm cuộc gọi đang mở.

Cuộc gọi không có người nghe hết hạn sau 60 giây; mất liên lạc với một phía được dọn sau khoảng 25–30 giây. Phiên gọi nằm trong bộ nhớ của một tiến trình Node, mất khi server khởi động lại. Nếu chạy nhiều tiến trình/máy chủ, cần chuyển kho signaling sang dịch vụ dùng chung; session đã lưu trong MySQL. Cuộc gọi tối đa 2 giờ.

Tài liệu API tham khảo: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling

## Kiểm tra khi không liên lạc được

Khách và nhân viên phải ở cùng mã phòng. Nhân viên cần đăng nhập, mở đúng yêu cầu ở bảng điều phối và bấm Tiếp nhận; sau đó mới trả lời và nghe được. Website không tự trả lời thay nhân viên.

Nếu trạng thái dừng ở xin quyền microphone: mở website bằng Chrome/Edge và cho phép microphone cho địa chỉ website. Trong lần thử bằng trình duyệt tích hợp, yêu cầu microphone đã hết thời gian chờ. Việc người dùng đồng ý trong chat không tự thay đổi quyền microphone của trình duyệt. Không khẳng định âm thanh đã hoạt động nếu chưa nghe thử thật.
