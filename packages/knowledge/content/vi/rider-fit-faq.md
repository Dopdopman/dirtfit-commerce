---
id: rider-fit-faq-vi
slug: rider-fit-faq
locale: vi
kicker: CẨM NANG KỸ THUẬT RIDER FIT
title: Hỏi đáp Kỹ thuật Rider Sag, Chống chân & Hạ yên
summary: Giải thích chi tiết Static Sag vs Rider Sag, hao hụt bề ngang yên (Seat Width Wrap Loss), 5 mức đánh giá chống chân và tác động thực tế của Giày MX Boots, Link hạ phuộc, Yên thấp.
publicPath: /policies/rider-fit
version: 2.0.0
lastUpdated: 2026-11-25
---

Xe máy địa hình sở hữu hành trình phuộc dài từ 210mm đến 313mm, vì vậy con số "chiều cao yên" ghi trên catalogue luôn khác đáng kể so với chiều cao thực tế khi bạn ngồi lên xe.

## [sag-and-effective-seat] Static Sag, Rider Sag & Chiều cao yên Thực tế

- **Chiều cao yên nguyên bản (`unladenSeatHeightMm`):** Đo khi xe dựng đứng hoàn toàn không tải (0 kg). Ví dụ KTM 350 EXC-F có yên nguyên bản **963mm**.
- **Static Sag (Độ lún tĩnh):** Độ sụt tự nhiên của phuộc dưới trọng lượng bản thân của chiếc xe (khoảng 22–36mm).
- **Rider Sag (`riderSagMm`):** Độ lún bổ sung khi có người lái + bộ đồ bảo hộ (`gearWeightKg`, mặc định 10 kg với MX Boots) ngồi lên yên.
- **Vật lý Liên kết Lũy tiến:** `@dirtfit/ergonomics-engine` dùng thông số `linkageProgressionAlpha`, `referenceRiderWeightKg` và độ lún mút yên (`FIRM`/`MEDIUM`/`PLUSH`) để tính **Chiều cao yên thực tế (`effectiveSeatHeightMm`)**.
- **Ngưỡng đánh giá Sag:**
  - `< 26%` hành trình phuộc sau → `TOO_STIFF` (lò xo quá cứng so với cân nặng, xe lún ít nên khó chống chân).
  - `26% – 37%` → **`OPTIMAL`** (tối ưu độ bám và thăng bằng khung sườn).
  - `37% – 45%` → `SOFT` (nên tăng preload hoặc thay lò xo nặng hơn).
  - `> 45%` (giới hạn kịch phuộc ở `52%`) → `BOTTOMING_RISK`.

## [seat-width-wrap-loss] Tại sao Yên rộng làm Khó chống chân hơn? (Wrap Loss)

Hai mẫu xe có cùng thông số yên **880mm** vẫn tạo cảm giác khác biệt rõ rệt khi dừng xe:

- Xe Enduro thi đấu yên hẹp (`145mm`) cho phép đùi khép thẳng xuống mặt đất.
- Xe Adventure 2 xi-lanh như **Yamaha Ténéré 700** (yên rộng `220mm`, yên nguyên bản `875mm`) khiến hai đùi bị choãi rộng sang hai bên mép yên, làm mất đi một phần chiều dài chân thực dụng (**Seat Width Wrap Loss**).
- Công cụ 2D tự động trừ phần hao hụt khi bề ngang yên vượt mốc `150mm` (`wrapLossMm = max(0, (seatWidthMm - 150) * 0.35)`) trước khi chấm điểm chống chân.

## [foot-contact-levels] Ý nghĩa 5 Mức Đánh giá Chống chân

Sau khi đối chiếu tầm với chân hữu dụng (`inseam thực tế + đế giày - wrapLoss`) với `effectiveSeatHeightMm`, hệ thống phân loại 5 trạng thái:

1. **`FLAT_FOOT` (Chống cả bàn chân):** Hai gót chạm đất hoàn toàn (`100%` ổn định — an toàn nhất cho người mới và đường dốc).
2. **`BALLS_OF_FEET` (Chống ức bàn chân):** Hai ức bàn chân bám chắc mặt đường (mức lý tưởng cho đa số người chạy Enduro / Dual-Sport).
3. **`TIP_TOE` (Nhón mũi chân):** Chống được đầu mũi hai bàn chân; chạy đường bằng ổn nhưng nhanh mỏi ở đường rãnh sâu.
4. **`ONE_FOOT_SHIFT` (Nghiêng hông chống 1 chân):** Nhích nhẹ hông sang trái để đặt trọn 1 bàn chân xuống đất và giữ chân phải trên phanh sau — kỹ thuật chuẩn của tay lái Enduro.
5. **`TOO_TALL_UNSAFE` (Quá tầm kiểm soát gốc):** Thiếu tầm với ngay cả khi nghiêng hông; **nên lắp Combo Link hạ phuộc + Yên thấp hoặc chọn khung xe thấp hơn** (như Honda CRF150L hoặc CRF300L).

## [lowering-and-boots] Phối hợp Giày MX Boots, Link hạ phuộc & Yên thấp

- **Tác động của Giày (`Footwear`):** Chuyển từ `SNEAKERS` (đế `+25mm`) sang **`ADV_BOOTS`** (`+35mm`) hoặc **`MX_BOOTS`** (`+42mm`) giúp tăng ngay tới `17mm` tầm với mỗi bên chân mà không phải can thiệp phuộc.
- **Link hạ phuộc (`-25mm` đến `-30mm`):** Thay đổi tỷ số đòn gánh gắp sau giúp hạ yên nhanh chóng. Khi hạ `-30mm`, DirtFit luôn khuyến nghị **hạ ty phuộc trước `10mm`** ở chảng ba để giữ nguyên góc lái và cảnh báo nếu khoảng sáng gầm xuống dưới `200mm`.
- **Yên thấp (`-20mm` đến `-25mm`):** Gọt mút và bo hẹp mép trước (`seatWidthReductionMm`), hạ tầm ngồi mà vẫn bảo toàn 100% hành trình phuộc và khoảng sáng gầm.
- **Gù nâng ghi đông (`+30mm`):** Tự động gợi ý khi tư thế đứng **Standing Attack** ghi nhận góc gập lưng `standingTorsoLeanDeg > 50°` ở người cao trên 180 cm.
