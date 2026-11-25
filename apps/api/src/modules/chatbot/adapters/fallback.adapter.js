import { CHAT_INTENTS, SHOWROOMS } from '@dirtfit/shared';

function formatMoney(amount, locale) {
  const num = Number(amount ?? 0);
  if (locale === 'vi') {
    return `${new Intl.NumberFormat('vi-VN').format(num)} ₫`;
  }
  return `${new Intl.NumberFormat('en-US').format(num)} VND`;
}

function getContactLabel(status, locale) {
  const viMap = {
    FLAT_FOOT: 'Chống cả hai bàn chân vững (FLAT_FOOT)',
    BALLS_OF_FEET: 'Chống phần ức bàn chân vững (BALLS_OF_FEET)',
    TIP_TOE: 'Chống mũi chân (TIP_TOE)',
    ONE_FOOT_SHIFT: 'Chống 1 chân nghiêng xe (ONE_FOOT_SHIFT)',
    TOO_TALL_UNSAFE: 'Yên quá cao (TOO_TALL_UNSAFE)',
  };
  const enMap = {
    FLAT_FOOT: 'Flat Foot (FLAT_FOOT)',
    BALLS_OF_FEET: 'Balls of Feet (BALLS_OF_FEET)',
    TIP_TOE: 'Tip-Toe (TIP_TOE)',
    ONE_FOOT_SHIFT: 'One-Foot Shift (ONE_FOOT_SHIFT)',
    TOO_TALL_UNSAFE: 'Too Tall Stock (TOO_TALL_UNSAFE)',
  };
  return (locale === 'vi' ? viMap[status] : enMap[status]) ?? status;
}

function formatPolicyResponse(groundedContext) {
  const { locale, retrievedChunks, intent } = groundedContext;
  const isVi = locale === 'vi';

  if (intent === CHAT_INTENTS.SHOWROOM_TEST_RIDE) {
    const showroomBullets = SHOWROOMS.map((s) => `- **${s.code}** — ${s.name}: ${s.address}`).join(
      '\n'
    );

    if (isVi) {
      const topNote = retrievedChunks[0]
        ? `\n\n- **Quy định lái thử:** ${retrievedChunks[0].snippet} [${retrievedChunks[0].sectionId}]`
        : '';
      return (
        `Bạn có thể đặt lịch lái thử trực tiếp tại 3 showroom DirtFit Commerce (khung giờ \`09:00–17:00\`, yêu cầu bằng lái hạng A1 hoặc A2 tùy dung tích xe):\n\n` +
        `${showroomBullets}${topNote}\n\n` +
        `Khi đặt lịch tại trang Lái thử, hãy đính kèm số đo Rider Fit để kỹ thuật viên cân chỉnh Preload/Sag hoặc chuẩn bị yên thấp trước khi bạn đến.`
      );
    }

    const topNote = retrievedChunks[0]
      ? `\n\n- **Booking guidelines:** ${retrievedChunks[0].snippet} [${retrievedChunks[0].sectionId}]`
      : '';
    return (
      `You can book a showroom test ride at any of our 3 DirtFit Commerce locations (hourly slots \`09:00–17:00\`, valid A1/A2 motorcycle license required):\n\n` +
      `${showroomBullets}${topNote}\n\n` +
      `Attach your 2D Rider Fit profile when booking so technicians pre-set suspension sag or install a lowering seat before you arrive.`
    );
  }

  if (retrievedChunks.length === 0) {
    return isVi
      ? 'Hiện tôi chưa tìm thấy mục chính sách khớp trực tiếp với câu hỏi này. Vui lòng xem chi tiết tại trang Chính sách đặt hàng, Điều khoản hoặc Bảo hành.'
      : 'I could not find an exact matching policy section. Please check our Ordering, Terms, or Warranty pages for complete details.';
  }

  const header = isVi
    ? '**Thông tin chính sách chính thức từ tài liệu DirtFit Commerce:**'
    : '**Official DirtFit Commerce policy summary:**';

  const bullets = retrievedChunks
    .slice(0, 3)
    .map((chunk) => `- **${chunk.heading}:** ${chunk.snippet} [${chunk.sectionId}]`)
    .join('\n\n');

  return `${header}\n\n${bullets}`;
}

function formatRiderFitResponse(groundedContext) {
  const { locale, recommendedBikes, effectiveRiderProfile } = groundedContext;
  const isVi = locale === 'vi';

  if (recommendedBikes.length === 0) {
    return isVi
      ? 'Hiện chưa có mẫu xe đang mở bán để tính toán thông số Rider Fit. Vui lòng quay lại trang Xe địa hình hoặc liên hệ showroom.'
      : 'No active motorcycles are currently available for Rider Fit evaluation. Please check our Bikes catalog or contact a showroom.';
  }

  const h = Math.round(effectiveRiderProfile.heightCm);
  const w = Math.round(effectiveRiderProfile.weightKg);

  const lines = recommendedBikes.map((bike, index) => {
    const loweringNote =
      bike.recommendedLoweringMm > 0
        ? isVi
          ? ` Gợi ý hạ yên: **-${bike.recommendedLoweringMm} mm** (${bike.loweringTip}).`
          : ` Lowering option: **-${bike.recommendedLoweringMm} mm** (${bike.loweringTip}).`
        : '';

    if (isVi) {
      return `${index + 1}. **${bike.name}** (${bike.category}) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** (Còn ${bike.availableQty} xe)\n   - Yên nguyên bản: \`${bike.unladenSeatHeightMm} mm\` → Yên thực tế sau Rider Sag (\`${bike.riderSagMm} mm\`): **${bike.effectiveSeatHeightMm} mm**\n   - Chống chân: **${getContactLabel(bike.contactStatus, 'vi')}** · Fit Score: **${bike.fitScore}/100**.${loweringNote}`;
    }

    return `${index + 1}. **${bike.name}** (${bike.category}) — Price: **${formatMoney(bike.priceVnd, 'en')}** (${bike.availableQty} in stock)\n   - Unladen seat: \`${bike.unladenSeatHeightMm} mm\` → Effective seat after Rider Sag (\`${bike.riderSagMm} mm\`): **${bike.effectiveSeatHeightMm} mm**\n   - Foot contact: **${getContactLabel(bike.contactStatus, 'en')}** · Fit Score: **${bike.fitScore}/100**.${loweringNote}`;
  });

  if (isVi) {
    return (
      `Kết quả mô phỏng kỹ thuật từ **@dirtfit/ergonomics-engine** cho vóc dáng **${h} cm / ${w} kg** (${effectiveRiderProfile.footwear}):\n\n` +
      `${lines.join('\n\n')}\n\n` +
      `*Lưu ý kỹ thuật:* Các số đo trên mang tính tham khảo dựa trên cấu hình tiêu chuẩn; bạn nên bấm **Mở Mô phỏng 2D** hoặc đặt lịch ngồi thử thực tế tại showroom. [ergo-disclaimer]`
    );
  }

  return (
    `Real technical evaluation from **@dirtfit/ergonomics-engine** for **${h} cm / ${w} kg** (${effectiveRiderProfile.footwear}):\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `*Technical disclaimer:* Calculations reflect standard factory calibration; open the **2D Simulator** card below or test-fit in person at our showrooms. [ergo-disclaimer]`
  );
}

function formatCatalogResponse(groundedContext) {
  const { locale, matchedCatalogBikes, liveBikes } = groundedContext;
  const isVi = locale === 'vi';
  const bikes = matchedCatalogBikes.length > 0 ? matchedCatalogBikes : liveBikes.slice(0, 4);

  if (bikes.length === 0) {
    return isVi
      ? 'Hiện danh mục xe đang được cập nhật. Vui lòng xem lại sau ít phút.'
      : 'Our live motorcycle catalog is currently being updated. Please check back shortly.';
  }

  const lines = bikes.map((bike) => {
    const seat = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
    if (isVi) {
      return `- **${bike.name}** (${bike.category} · ${bike.engineCc}cc) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** | Đặt cọc: **${formatMoney(bike.depositAmountVnd, 'vi')}** | Yên tiêu chuẩn: \`${seat} mm\` | Tồn kho khả dụng: **${bike.availableQty}**`;
    }
    return `- **${bike.name}** (${bike.category} · ${bike.engineCc}cc) — Price: **${formatMoney(bike.priceVnd, 'en')}** | Deposit: **${formatMoney(bike.depositAmountVnd, 'en')}** | Unladen seat: \`${seat} mm\` | Available: **${bike.availableQty}**`;
  });

  return (
    (isVi
      ? '**Thông tin giá bán & tồn kho trực tiếp từ DirtFit Catalog:**'
      : '**Live pricing & availability from DirtFit Catalog:**') +
    '\n\n' +
    lines.join('\n')
  );
}

function formatOrderStatusHelp(groundedContext) {
  const { locale, userId, scopedOrders } = groundedContext;
  const isVi = locale === 'vi';

  if (!userId) {
    return isVi
      ? 'Để kiểm tra đơn hàng và lịch sử đặt cọc cá nhân, vui lòng **đăng nhập** tài khoản DirtFit và truy cập mục **Tài khoản → Đơn hàng & Đặt cọc** (`/account`). Lưu ý đơn giữ chỗ chờ thanh toán PayOS VietQR có hiệu lực **15 phút**.'
      : 'To check your orders and deposit status securely, please **sign in** to your DirtFit account and open **Account → Orders & Deposits** (`/account`). Pending PayOS VietQR reservation holds remain active for **15 minutes**.';
  }

  if (scopedOrders.length === 0) {
    return isVi
      ? 'Tài khoản của bạn hiện chưa có đơn hàng nào đang lưu. Bạn có thể chọn xe, tính Rider Fit và đặt giữ chỗ 15 phút bất cứ lúc nào.'
      : 'Your account does not have any orders yet. You can browse motorcycles, check your 2D Rider Fit, and place a 15-minute deposit hold anytime.';
  }

  const lines = scopedOrders.map((o) =>
    isVi
      ? `- Đơn **${o.orderNumber}** (${o.orderType}) — Trạng thái: **${o.status}** · Tổng: **${formatMoney(o.totalVnd, 'vi')}** · Thanh toán ngay: **${formatMoney(o.payableNowVnd, 'vi')}**`
      : `- Order **${o.orderNumber}** (${o.orderType}) — Status: **${o.status}** · Total: **${formatMoney(o.totalVnd, 'en')}** · Payable now: **${formatMoney(o.payableNowVnd, 'en')}**`
  );

  return (
    (isVi ? '**Các đơn hàng gần nhất của bạn:**' : '**Your most recent DirtFit orders:**') +
    '\n\n' +
    lines.join('\n') +
    (isVi
      ? '\n\nXem chi tiết và thanh toán tại trang **Tài khoản** (`/account`).'
      : '\n\nView full details in **Account** (`/account`).')
  );
}

/**
 * Deterministic Zero-Key Grounded Fallback Adapter.
 * Generates strictly grounded EN/VI responses from `@dirtfit/knowledge`, `CatalogCache`, and `@dirtfit/ergonomics-engine`.
 */
export class GroundedFallbackAdapter {
  /**
   * @param {object} groundedContext
   * @returns {Promise<{ content: string, provider: string, degraded: boolean }>}
   */
  async generate(groundedContext) {
    let content;

    switch (groundedContext.intent) {
      case CHAT_INTENTS.POLICY_ORDERING:
      case CHAT_INTENTS.POLICY_TERMS:
      case CHAT_INTENTS.POLICY_WARRANTY:
      case CHAT_INTENTS.SHOWROOM_TEST_RIDE:
        content = formatPolicyResponse(groundedContext);
        break;
      case CHAT_INTENTS.RIDER_FIT_ADVICE:
        content = formatRiderFitResponse(groundedContext);
        break;
      case CHAT_INTENTS.CATALOG_PRICING:
        content = formatCatalogResponse(groundedContext);
        break;
      case CHAT_INTENTS.ORDER_STATUS_HELP:
        content = formatOrderStatusHelp(groundedContext);
        break;
      default:
        content =
          groundedContext.locale === 'vi'
            ? 'Tôi là trợ lý kỹ thuật của **DirtFit Commerce**. Tôi chỉ hỗ trợ các chủ đề về xe cào cào/dual-sport/adventure, tư vấn vóc dáng Rider Fit, giá bán & tồn kho, đặt cọc PayOS VietQR, điều khoản, bảo hành và lịch lái thử tại showroom.'
            : 'I am the **DirtFit Commerce** technical assistant. I only assist with off-road/dual-sport/adventure motorcycles, Rider Fit sizing, live pricing & stock, PayOS VietQR deposits, warranty/terms policies, and showroom test rides.';
        break;
    }

    return {
      content,
      provider: 'grounded-fallback',
      degraded: false,
    };
  }
}
