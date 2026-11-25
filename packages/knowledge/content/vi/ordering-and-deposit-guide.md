---
id: ordering-and-deposit-guide-vi
slug: ordering-and-deposit-guide
locale: vi
kicker: QUY TRÌNH ĐẶT HÀNG & LÁI THỬ
title: Hướng dẫn Đặt hàng, Đặt cọc & Lái thử
summary: Quy trình chọn xe bằng Mô phỏng 2D Rider Fit, cơ chế giữ chỗ tồn kho 15 phút (Lazy Expiration), thanh toán PayOS VietQR, luật chặn COD cho xe máy, hủy đơn và đặt lịch lái thử tại 3 showroom DirtFit.
publicPath: /policies/ordering
version: 2.0.0
lastUpdated: 2026-11-25
---

DirtFit Commerce áp dụng khóa tồn kho giao dịch ACID, tính tiền cọc VND chính xác và đóng gói sẵn combo phụ kiện hạ yên tại xưởng để mỗi chiếc xe địa hình khi bàn giao đều vừa vặn đúng vóc dáng người lái.

## [simulator-selection] Chọn xe & Combo hạ yên qua Mô phỏng 2D

1. Bắt đầu từ **Quick Fit Bar** ở trang chủ hoặc mở `/bikes` bật **Bộ lọc Smart Rider-Fit** (`chiều cao cm`, `cân nặng kg`, `inseam`, `loại giày`).
2. Vào trang chi tiết xe (`/bikes/[slug]`) để kéo thanh trượt mô phỏng **Rider Fit 2D** theo thời gian thực (0ms độ trễ).
3. Nếu xe nguyên bản cho kết quả `TIP_TOE`, `ONE_FOOT_SHIFT` hoặc `TOO_TALL_UNSAFE`, hãy bật thử **Link hạ phuộc** (`-25mm` đến `-30mm`), **Yên thấp** (`-20mm` đến `-25mm`) hoặc **Nâng ghi đông** (`+30mm`).
4. Bấm **Thêm Combo Xe + Phụ kiện hạ yên** để gom xe và phụ tùng tương thích thành một nhóm (`bundleGroupId`), giúp kỹ thuật viên tính công lắp đặt (`installLaborVnd`) và cân chỉnh sẵn trước khi giao xe.

> Mẹo: Truy cập `/compare` (**Ghost Overlay**) để xếp chồng 2 mẫu xe theo đúng tỷ lệ chiều dài cơ sở (milimét) trước khi quyết định đặt cọc.

## [inventory-hold-ttl] Thời hạn Đặt cọc, Giữ chỗ 15 Phút & Lazy Expiration

- Mọi yêu cầu thanh toán (`checkout`) đều bắt buộc gửi kèm header `Idempotency-Key` nhằm chống trùng lặp đơn hàng khi rớt mạng.
- Bên trong transaction PostgreSQL (`SELECT ... FOR UPDATE`), hệ thống giữ chỗ tồn kho xe và phụ kiện để chờ đặt cọc/thanh toán trong **15 phút** (`reservationExpiresAt`).
- **Lazy Expiration tức thì:** Nếu sau 15 phút đơn hàng chưa thanh toán thành công, lượng tồn kho bị giữ sẽ được thu hồi ngay lập tức ở lần kiểm tra tồn kho hoặc đơn checkout kế tiếp mà không cần chờ cron chạy nền.
- Số lượng khả dụng (`availableQty`) hiển thị minh bạch theo thời gian thực trên `/bikes`, `/cart` và `/checkout`.

## [payment-payos-vietqr] Đặt cọc xe, Thanh toán đủ & PayOS VietQR

- **Đặt cọc giữ xe (`BIKE_DEPOSIT`):** Thanh toán trước số tiền đặt cọc niêm yết bằng VND (`depositAmountVnd`) của từng mẫu xe để giữ xe (kèm phụ kiện tương thích nếu mua theo combo); phần còn lại (`remainingBalanceVnd`) thanh toán khi nhận xe/hoàn tất bàn giao.
- **Thanh toán toàn bộ (`FULL_PURCHASE`):** Thanh toán `100%` giá trị đơn hàng trực tuyến ngay khi đặt.
- **Cổng PayOS VietQR (Mặc định Production):** Sau khi đặt đơn, hệ thống tạo liên kết chuyển khoản **PayOS VietQR**. Giao dịch xác nhận tự động qua webhook ký HMAC, trừ kho vĩnh viễn (`COMMITTED`) và chuyển trạng thái đơn sang `DEPOSIT_PAID` hoặc `PAID`.
- Toàn bộ đơn giá hiển thị bằng **VND** nguyên vẹn (`BIGINT`), không phát sinh phụ phí ẩn.

## [cod-policy] Quy định & Giới hạn Thanh toán COD (Thu hộ)

> Quy định bắt buộc: **Cấm tuyệt đối thanh toán COD đối với mọi đơn hàng có chứa xe máy (`BIKE`).**

| Loại đơn hàng                                         | Hỗ trợ COD?         | Hạn mức tối đa          | Ghi chú nghiệp vụ                                       |
| :---------------------------------------------------- | :------------------ | :---------------------- | :------------------------------------------------------ |
| `BIKE_DEPOSIT` (Đặt cọc xe + phụ kiện)                | **Không (Bị chặn)** | Không áp dụng           | Bắt buộc đặt cọc trực tuyến qua PayOS VietQR            |
| `FULL_PURCHASE` (Thanh toán đủ có xe)                 | **Không (Bị chặn)** | Không áp dụng           | Bắt buộc thanh toán trực tuyến                          |
| `ACCESSORY_ONLY` (Chỉ phụ tùng / đồ bảo hộ / giày MX) | **Có**              | **`<= 20.000.000 VND`** | Đơn phụ kiện trên 20.000.000 VND phải thanh toán online |

Nếu giỏ hàng thuần phụ kiện (`ACCESSORY_ONLY`) có tổng giá trị từ **20.000.000 VND trở xuống** và bạn chọn `COD`, đơn sẽ được xác nhận ngay (`CONFIRMED`) và giữ/trừ tồn kho tức thì.

## [order-cancellation] Hủy đơn hàng & Hoàn trả Tồn kho Tức thì

- Đơn đang ở trạng thái `PENDING_PAYMENT` có thể tự hủy ngay tại **Quản lý Tài khoản (`/account`)** (`POST /api/v1/orders/:id/cancel`).
- Ngay khi hủy thành công, trạng thái đơn chuyển sang `CANCELLED` và toàn bộ lượt giữ chỗ (`InventoryReservation`) được giải phóng tức thì về kho chung.
- Đối với đơn đã chuyển `DEPOSIT_PAID`, `PAID` hoặc `PREPARING`, vui lòng liên hệ trực tiếp tư vấn viên showroom phụ trách để hỗ trợ đổi mẫu xe, chuyển showroom nhận hoặc hoàn cọc theo chính sách bảo hành & đổi trả.

## [test-ride-showrooms] Đặt lịch Lái thử tại 3 Showroom DirtFit

Trước khi xuống cọc, bạn có thể đặt lịch lái thử 90 phút tại `/test-ride`. Hệ thống đính kèm **Hồ sơ Vóc dáng (`UserBodyProfile`)** và yêu cầu lắp yên thấp để kỹ thuật viên cân sẵn preload phuộc trước khi bạn tới showroom.

| Mã Showroom    | Showroom                   | Địa chỉ                              | Khung giờ mỗi ngày                                         |
| :------------- | :------------------------- | :----------------------------------- | :--------------------------------------------------------- |
| `HN_LONG_BIEN` | DirtFit Hà Nội — Long Biên | 45 Cổ Linh, Quận Long Biên, Hà Nội   | `09:00-10:30`, `10:30-12:00`, `14:00-15:30`, `15:30-17:00` |
| `DN_SON_TRA`   | DirtFit Đà Nẵng — Sơn Trà  | 120 Ngô Quyền, Quận Sơn Trà, Đà Nẵng | `09:00-10:30`, `10:30-12:00`, `14:00-15:30`, `15:30-17:00` |
| `HCM_THU_DUC`  | DirtFit TP.HCM — Thủ Đức   | 88 Mai Chí Thọ, TP. Thủ Đức, TP.HCM  | `09:00-10:30`, `10:30-12:00`, `14:00-15:30`, `15:30-17:00` |

- **Yêu cầu bằng lái:** Bằng **`A1`** hợp lệ (với xe <= 175cc như CRF150L, WR155R) hoặc **`A2`** (với xe >= 175cc như CRF300L, KLX230, KTM 350 EXC-F, Husqvarna FE 350, Ténéré 700). Riêng dòng sân đua không biển số CRF250R được thử trong khu vực sân kín có giám sát.
- Mỗi tổ hợp `(xe, showroom, ngày, khung giờ)` chỉ nhận 1 lịch `PENDING` hoặc `CONFIRMED` để chống trùng lịch; khi hủy lịch, khung giờ sẽ mở lại ngay.
