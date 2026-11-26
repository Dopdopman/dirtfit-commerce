import { CHAT_INTENTS, SHOWROOMS } from '@dirtfit/shared';

function formatMoney(amount, locale) {
  const num = Number(amount ?? 0);
  if (locale === 'vi') {
    return `${new Intl.NumberFormat('vi-VN').format(num)} ₫`;
  }
  return `${new Intl.NumberFormat('en-US').format(num)} VND`;
}

function formatBikeLink(bike) {
  return `[${bike.name}](/bikes/${bike.slug})`;
}

function formatAccessoryLink(name, sku) {
  return `[${name}](/accessories?sku=${encodeURIComponent(sku)})`;
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
        `Khi đặt lịch tại trang [Lái thử](/test-ride), hãy đính kèm số đo Rider Fit để kỹ thuật viên cân chỉnh Preload/Sag hoặc chuẩn bị yên thấp trước khi bạn đến.`
      );
    }

    const topNote = retrievedChunks[0]
      ? `\n\n- **Booking guidelines:** ${retrievedChunks[0].snippet} [${retrievedChunks[0].sectionId}]`
      : '';
    return (
      `You can book a showroom test ride at any of our 3 DirtFit Commerce locations (hourly slots \`09:00–17:00\`, valid A1/A2 motorcycle license required):\n\n` +
      `${showroomBullets}${topNote}\n\n` +
      `Attach your 2D Rider Fit profile on the [Test Ride](/test-ride) page when booking so technicians pre-set suspension sag or install a lowering seat before you arrive.`
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
    const accSnippet =
      bike.loweringAccessorySku && bike.loweringAccessoryName
        ? ` — ${formatAccessoryLink(bike.loweringAccessoryName, bike.loweringAccessorySku)}`
        : '';
    const loweringNote =
      bike.recommendedLoweringMm > 0
        ? isVi
          ? ` Gợi ý hạ yên: **-${bike.recommendedLoweringMm} mm** (${bike.loweringTip})${accSnippet}.`
          : ` Lowering option: **-${bike.recommendedLoweringMm} mm** (${bike.loweringTip})${accSnippet}.`
        : '';
    const bikeLink = `**${formatBikeLink(bike)}**`;

    if (isVi) {
      return `${index + 1}. ${bikeLink} (${bike.category}) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** (Còn ${bike.availableQty} xe)\n   - Yên nguyên bản: \`${bike.unladenSeatHeightMm} mm\` → Yên thực tế sau Rider Sag (\`${bike.riderSagMm} mm\`): **${bike.effectiveSeatHeightMm} mm**\n   - Chống chân: **${getContactLabel(bike.contactStatus, 'vi')}** · Fit Score: **${bike.fitScore}/100**.${loweringNote}`;
    }

    return `${index + 1}. ${bikeLink} (${bike.category}) — Price: **${formatMoney(bike.priceVnd, 'en')}** (${bike.availableQty} in stock)\n   - Unladen seat: \`${bike.unladenSeatHeightMm} mm\` → Effective seat after Rider Sag (\`${bike.riderSagMm} mm\`): **${bike.effectiveSeatHeightMm} mm**\n   - Foot contact: **${getContactLabel(bike.contactStatus, 'en')}** · Fit Score: **${bike.fitScore}/100**.${loweringNote}`;
  });

  if (isVi) {
    return (
      `Kết quả mô phỏng kỹ thuật từ **@dirtfit/ergonomics-engine** cho vóc dáng **${h} cm / ${w} kg** (${effectiveRiderProfile.footwear}):\n\n` +
      `${lines.join('\n\n')}\n\n` +
      `*Lưu ý kỹ thuật:* Các số đo trên mang tính tham khảo dựa trên cấu hình tiêu chuẩn; bạn nên bấm **Mở Mô phỏng 2D** hoặc đặt lịch ngồi thử thực tế tại showroom. [ergonomics-disclaimer]`
    );
  }

  return (
    `Real technical evaluation from **@dirtfit/ergonomics-engine** for **${h} cm / ${w} kg** (${effectiveRiderProfile.footwear}):\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `*Technical disclaimer:* Calculations reflect standard factory calibration; open the **2D Simulator** card below or test-fit in person at our showrooms. [ergonomics-disclaimer]`
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
    const bikeLink = `**${formatBikeLink(bike)}**`;
    if (isVi) {
      return `- ${bikeLink} (${bike.category} · ${bike.engineCc}cc) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** | Đặt cọc: **${formatMoney(bike.depositAmountVnd, 'vi')}** | Yên tiêu chuẩn: \`${seat} mm\` | Tồn kho khả dụng: **${bike.availableQty}**`;
    }
    return `- ${bikeLink} (${bike.category} · ${bike.engineCc}cc) — Price: **${formatMoney(bike.priceVnd, 'en')}** | Deposit: **${formatMoney(bike.depositAmountVnd, 'en')}** | Unladen seat: \`${seat} mm\` | Available: **${bike.availableQty}**`;
  });

  const compareSuffix =
    matchedCatalogBikes.length >= 2
      ? isVi
        ? `\n\nBạn có thể đặt hai mẫu xe cạnh nhau tại [So sánh 2D Ghost Overlay](/compare?bikeA=${encodeURIComponent(bikes[0].slug)}&bikeB=${encodeURIComponent(bikes[1].slug)}).`
        : `\n\nCompare geometry side-by-side in [Compare in 2D Ghost Overlay](/compare?bikeA=${encodeURIComponent(bikes[0].slug)}&bikeB=${encodeURIComponent(bikes[1].slug)}).`
      : '';

  return (
    (isVi
      ? '**Thông tin giá bán & tồn kho trực tiếp từ DirtFit Catalog:**'
      : '**Live pricing & availability from DirtFit Catalog:**') +
    '\n\n' +
    lines.join('\n') +
    compareSuffix
  );
}

function formatOrderStatusHelp(groundedContext) {
  const { locale, userId, scopedOrders } = groundedContext;
  const isVi = locale === 'vi';

  if (!userId) {
    return isVi
      ? 'Để kiểm tra đơn hàng và lịch sử đặt cọc cá nhân, vui lòng **đăng nhập** tài khoản DirtFit và truy cập mục [Tài khoản → Đơn hàng & Đặt cọc](/account). Lưu ý đơn giữ chỗ chờ thanh toán PayOS VietQR có hiệu lực **15 phút**.'
      : 'To check your orders and deposit status securely, please **sign in** to your DirtFit account and open [Account → Orders & Deposits](/account). Pending PayOS VietQR reservation holds remain active for **15 minutes**.';
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
      ? '\n\nXem chi tiết và thanh toán tại trang [Tài khoản](/account).'
      : '\n\nView full details in [Account](/account).')
  );
}

function formatGreetingResponse(locale) {
  if (locale === 'vi') {
    return (
      'Chào bạn! Tôi là **Trợ lý Kỹ thuật DirtFit Commerce**. Tôi có thể hỗ trợ bạn ngay:\n\n' +
      '- **Tư vấn chọn xe theo vóc dáng (Rider Fit 2D):** Nhập chiều cao & cân nặng (ví dụ: *"Cao 1m68 nặng 65kg đi xe nào?"*) để Engine tính độ lún phuộc và mức chống chân thực tế.\n' +
      '- **Báo giá, tồn kho & phụ kiện hạ yên:** Hỏi trực tiếp tên xe (KTM, Honda CRF, Yamaha WR/Ténéré, Kawasaki KLX, Suzuki DR-Z) hoặc nhu cầu mua xe.\n' +
      '- **Đặt cọc PayOS VietQR, luật COD, bảo hành & lịch lái thử:** Tại 3 showroom Hà Nội, Đà Nẵng và TP.HCM.'
    );
  }

  return (
    'Hello! I am the **DirtFit Commerce** Technical Assistant. I can help you right away with:\n\n' +
    '- **2D Rider Fit Sizing:** Share your height & weight (e.g., *"I\'m 168cm 65kg, which bike fits me?"*) for real suspension sag and foot-reach scoring.\n' +
    '- **Live Bike Pricing, Stock & Lowering Kits:** Ask about any off-road/dual-sport/adventure model or tell me what type of bike you want to buy.\n' +
    '- **Deposits, COD Rules, Warranty & Test Rides:** PayOS VietQR 15-minute holds and showroom bookings in Hanoi, Da Nang, and HCMC.'
  );
}

function formatGeneralPurchaseResponse(groundedContext) {
  const { locale, matchedCatalogBikes, liveBikes } = groundedContext;
  const isVi = locale === 'vi';
  const bikes = matchedCatalogBikes.length > 0 ? matchedCatalogBikes : liveBikes.slice(0, 4);

  const catalogLines = bikes.map((bike) => {
    const seat = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
    const bikeLink = `**${formatBikeLink(bike)}**`;
    if (isVi) {
      return `- ${bikeLink} (${bike.category} · ${bike.engineCc}cc) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** | Yên: \`${seat} mm\` | Còn **${bike.availableQty}** xe`;
    }
    return `- ${bikeLink} (${bike.category} · ${bike.engineCc}cc) — Price: **${formatMoney(bike.priceVnd, 'en')}** | Seat: \`${seat} mm\` | **${bike.availableQty}** available`;
  });

  if (isVi) {
    const body =
      catalogLines.length > 0
        ? `\n\n${catalogLines.join('\n')}`
        : '\n\nHiện danh mục xe đang được cập nhật trực tiếp trên trang [Xe địa hình](/bikes).';
    return (
      'Rất vui được tư vấn chọn xe phù hợp cho bạn tại **DirtFit Commerce**! Một số mẫu xe tiêu biểu theo từng phân khúc hiện có:' +
      body +
      '\n\nĐể tôi tính chính xác mức **chống chân & Rider Sag** qua Engine 2D, bạn vui lòng cho biết thêm **chiều cao (cm)**, **cân nặng (kg)** và **địa hình chạy chính** (đi phố/tour nhẹ Dual-Sport, off-road Enduro/Motocross hay đường dài Adventure) nhé!'
    );
  }

  const body =
    catalogLines.length > 0
      ? `\n\n${catalogLines.join('\n')}`
      : '\n\nYou can browse our latest stock on the [Motorcycles](/bikes) page.';
  return (
    'I would be glad to help you choose the right motorcycle at **DirtFit Commerce**! Here are representative live models across our segments:' +
    body +
    '\n\nTo calculate your exact **2D foot contact and Rider Sag** with `@dirtfit/ergonomics-engine`, please share your **height (cm)**, **weight (kg)**, and **primary terrain** (Dual-Sport street/trail, Enduro/MX off-road, or Adventure touring).'
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
      case CHAT_INTENTS.GREETING:
        content = formatGreetingResponse(groundedContext.locale);
        break;
      case CHAT_INTENTS.GENERAL_PURCHASE:
        content = formatGeneralPurchaseResponse(groundedContext);
        break;
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
