---
id: terms-and-conditions-vi
slug: terms-and-conditions
locale: vi
kicker: ĐIỀU KHOẢN & QUY ĐỊNH NỀN TẢNG
title: Điều khoản & Điều kiện Sử dụng
summary: Quy định tài khoản (Email/Mật khẩu & Google OAuth 2.0), tuyên bố miễn trừ kỹ thuật cho Mô phỏng 2D Rider Fit & AI Chatbot, quy tắc giá VND, sở hữu trí tuệ và bảo mật dữ liệu cá nhân.
publicPath: /policies/terms
version: 2.0.0
lastUpdated: 2026-11-25
---

Khi truy cập DirtFit Commerce, sử dụng công cụ Mô phỏng Vóc dáng 2D, trò chuyện với AI Hỗ trợ Kỹ thuật hoặc đặt hàng, bạn xác nhận đồng ý với các điều khoản dưới đây.

## [account-security] Tài khoản, Google OAuth 2.0 & Bảo mật Phiên đăng nhập

- Bạn có thể đăng ký bằng Email + Mật khẩu (băm an toàn chuẩn **Argon2id**) hoặc đăng nhập nhanh bằng **Google OAuth 2.0** (bắt buộc email Google đã xác minh).
- Người dùng có trách nhiệm bảo mật thông tin đăng nhập và cung cấp chính xác số điện thoại, địa chỉ nhận hàng phục vụ giao xe và PDI.
- DirtFit vận hành cơ chế xoay vòng **Refresh Token `HttpOnly`** kèm phát hiện tái sử dụng (**Reuse Detection**): nếu phát hiện token cũ bị dùng lại trái phép, toàn bộ chuỗi phiên đăng nhập liên quan sẽ bị thu hồi tức thì để bảo vệ tài khoản.
- Bạn có thể chủ động đăng xuất trên tất cả thiết bị hoặc quản lý liên kết đăng nhập trong trang `/account`.

## [ergonomics-disclaimer] Tuyên bố Miễn trừ Kỹ thuật cho Mô phỏng 2D & AI Hỗ trợ

> Lưu ý quan trọng: **Mọi thông số công thái học từ `@dirtfit/ergonomics-engine` và nội dung tư vấn từ AI Support Chatbot chỉ mang tính tham khảo kỹ thuật.**

- Công cụ Mô phỏng 2D Rider Fit tính toán độ lún phuộc (Static/Rider Sag), độ hao hụt do bề ngang yên (Seat Width Wrap Loss), chiều cao đế giày và động học ngược 2D dựa trên thông số khung sườn tiêu chuẩn (`BikeGeometrySpec`) và tỷ lệ nhân trắc học phổ thông.
- Độ dẻo khớp hông, bề ngang khung chậu riêng biệt, lốp độ, áp suất lốp hoặc tùy chỉnh rebound/compression thực tế có thể làm thay đổi độ chống chân thực tế vài milimét.
- Phản hồi của AI Support được trích xuất từ kho tài liệu chuẩn và dữ liệu catalog trực tiếp, nhưng không thay thế kiểm định cơ khí trực tiếp hay buổi chạy thử tại showroom DirtFit.
- Luôn kiểm tra khả năng chống chân và giữ thăng bằng xe an toàn trước khi tham gia giao thông hoặc chạy địa hình phức tạp.

## [pricing-and-orders] Giá niêm yết VND, Tồn kho & Chống gian lận

- Toàn bộ giá bán được niêm yết bằng **Việt Nam Đồng (`VND`)**, chưa bao gồm chi phí lắp đặt phụ tùng tùy chỉnh trừ khi hiển thị rõ mục `installLaborVnd` trong giỏ hàng/đơn hàng.
- Tồn kho khả dụng được khóa và xác thực trực tiếp trên máy chủ tại thời điểm thanh toán. DirtFit bảo lưu quyền hủy các đơn hàng phát sinh từ lỗi hiển thị giá bất thường, giả mạo chữ ký thanh toán hoặc không đủ điều kiện bằng lái/pháp lý khi bàn giao xe.
- Các mẫu Motocross chuyên sân đua không biển số (ví dụ `Honda CRF250R`, `streetLegal: false`) chỉ được phép sử dụng trong đường đua hoặc khu vực khép kín, không đủ điều kiện đăng ký lưu hành đường bộ.

## [intellectual-property] Quyền Sở hữu Trí tuệ & Quy tắc Sử dụng

- Bản vẽ khung dây CAD 2D, ảnh hiệu chuẩn side-profile, thuật toán mô phỏng vật lý và thương hiệu DirtFit thuộc quyền sở hữu trí tuệ của DirtFit Commerce.
- Nghiêm cấm hành vi thu thập dữ liệu tự động trái phép, spam làm quá tải API, tấn công Prompt Injection vào hệ thống hỗ trợ, hoặc tải lên tệp giả mạo định dạng qua cổng upload media (mọi hành vi bất thường đều được ghi vết vào `AuditLog`).

## [privacy-data] Bảo mật Dữ liệu Cá nhân, Số đo Vóc dáng & Lịch sử Chat

- **Hồ sơ Vóc dáng (`UserBodyProfile`)** (`heightCm`, `weightKg`, `inseamCm`, `footwear`, `gearWeightKg`) chỉ được dùng để cá nhân hóa bộ lọc xe phù hợp, mô phỏng 2D và hỗ trợ kỹ thuật viên cân chỉnh preload trước khi giao xe/lái thử.
- Hội thoại hỗ trợ của tài khoản đã đăng nhập được lưu để giữ ngữ cảnh tới khi bạn chủ động đặt lại/xóa; phiên chat của khách ẩn danh dùng cookie `HttpOnly` sẽ **tự động hết hạn và được dọn sạch sau 7 ngày**.
- DirtFit cam kết không mua bán hay chia sẻ số đo cá nhân, lịch sử đơn hàng hoặc nội dung hội thoại cho bên thứ ba.
