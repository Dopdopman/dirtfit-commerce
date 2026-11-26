import { CHAT_INTENTS, SHOWROOMS } from '@dirtfit/shared';
import {
  formatAccessoryCategoryLabel,
  formatCategoryLabel,
  formatContactLabel,
  formatFootwearLabel,
  formatOrderStatusLabel,
  formatOrderTypeLabel,
  getSimulatorBrandName,
} from '../human-labels.js';

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

function resolveRequestedBrandDisplay(groundedContext) {
  const requested = groundedContext.catalogEntities?.requestedBrands ?? [];
  if (requested.length === 0) {
    return null;
  }
  const matched = groundedContext.matchedCatalogBikes ?? [];
  const names = [];
  for (const slug of requested) {
    const bike = matched.find(
      (b) => (b.brand?.slug ?? '').toLowerCase() === String(slug).toLowerCase()
    );
    names.push(bike?.brand?.name ?? slug.toUpperCase());
  }
  return Array.from(new Set(names)).join(', ');
}

function formatUnstockedBrandResponse(groundedContext) {
  const { locale, catalogEntities, stockedBrandNames } = groundedContext;
  const isVi = locale === 'vi';
  const askedBrands = (catalogEntities?.unstockedBrands ?? []).join(', ') || 'requested';
  const stocked =
    stockedBrandNames?.length > 0
      ? stockedBrandNames.join(', ')
      : 'Honda, Yamaha, Kawasaki, KTM, Husqvarna';

  if (isVi) {
    return (
      `Hiện tại **DirtFit Commerce** chưa kinh doanh dòng xe **${askedBrands}**. ` +
      `Danh mục xe đang sẵn kho của shop gồm các hãng: **${stocked}**.\n\n` +
      `Bạn có thể xem toàn bộ xe đang bán tại trang [Xe địa hình](/bikes) hoặc nhắn tên một trong các hãng trên để tôi kiểm tra giá bán, thông số yên và tồn kho nhé!`
    );
  }

  return (
    `**DirtFit Commerce** does not currently carry **${askedBrands}** motorcycles. ` +
    `Our live catalog stocks: **${stocked}**.\n\n` +
    `You can browse all available models on our [Motorcycles](/bikes) page or ask about any of the stocked brands above.`
  );
}

function formatPolicyResponse(groundedContext) {
  const { locale, retrievedChunks, intent } = groundedContext;
  const isVi = locale === 'vi';

  if (intent === CHAT_INTENTS.SHOWROOM_TEST_RIDE) {
    const showroomBullets = SHOWROOMS.map((s) => `- **${s.name}:** ${s.address}`).join('\n');

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
  const { locale, recommendedBikes, effectiveRiderProfile, catalogScopeStatus } = groundedContext;
  const isVi = locale === 'vi';

  if (catalogScopeStatus === 'UNSTOCKED_BRAND') {
    return formatUnstockedBrandResponse(groundedContext);
  }

  if (recommendedBikes.length === 0) {
    return isVi
      ? 'Hiện chưa có mẫu xe phù hợp đang mở bán để tính toán thông số Rider Fit. Vui lòng xem danh mục tại trang [Xe địa hình](/bikes) hoặc liên hệ showroom.'
      : 'No matching active motorcycles are currently available for Rider Fit evaluation. Please check our [Motorcycles](/bikes) catalog or contact a showroom.';
  }

  const h = Math.round(effectiveRiderProfile.heightCm);
  const w = Math.round(effectiveRiderProfile.weightKg);
  const footwearLabel = formatFootwearLabel(effectiveRiderProfile.footwear, locale);
  const simBrand = getSimulatorBrandName(locale);

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
    const categoryLabel = formatCategoryLabel(bike.category, locale);
    const contactLabel = formatContactLabel(bike.contactStatus, locale);

    if (isVi) {
      return `${index + 1}. ${bikeLink} (${categoryLabel}) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** (Còn ${bike.availableQty} xe)\n   - Yên nguyên bản: \`${bike.unladenSeatHeightMm} mm\` → Yên thực tế sau Rider Sag (\`${bike.riderSagMm} mm\`): **${bike.effectiveSeatHeightMm} mm**\n   - Chống chân: **${contactLabel}** · Fit Score: **${bike.fitScore}/100**.${loweringNote}`;
    }

    return `${index + 1}. ${bikeLink} (${categoryLabel}) — Price: **${formatMoney(bike.priceVnd, 'en')}** (${bike.availableQty} in stock)\n   - Unladen seat: \`${bike.unladenSeatHeightMm} mm\` → Effective seat after Rider Sag (\`${bike.riderSagMm} mm\`): **${bike.effectiveSeatHeightMm} mm**\n   - Foot contact: **${contactLabel}** · Fit Score: **${bike.fitScore}/100**.${loweringNote}`;
  });

  if (isVi) {
    return (
      `Kết quả mô phỏng từ **${simBrand}** cho vóc dáng **${h} cm / ${w} kg** (${footwearLabel}):\n\n` +
      `${lines.join('\n\n')}\n\n` +
      `*Lưu ý kỹ thuật:* Các số đo trên mang tính tham khảo dựa trên cấu hình tiêu chuẩn; bạn nên bấm **Mở Mô phỏng 2D** hoặc đặt lịch ngồi thử thực tế tại showroom. [ergonomics-disclaimer]`
    );
  }

  return (
    `Evaluation from **${simBrand}** for **${h} cm / ${w} kg** (${footwearLabel}):\n\n` +
    `${lines.join('\n\n')}\n\n` +
    `*Technical disclaimer:* Calculations reflect standard factory calibration; open the **2D Simulator** card below or test-fit in person at our showrooms. [ergonomics-disclaimer]`
  );
}

function formatAccessoriesOnlyResponse(groundedContext) {
  const { locale, matchedAccessories } = groundedContext;
  const isVi = locale === 'vi';

  if (matchedAccessories.length === 0) {
    return isVi
      ? 'Hiện không tìm thấy phụ kiện khớp chính xác trong kho. Bạn có thể xem toàn bộ phụ tùng hạ yên & đồ bảo hộ tại trang [Phụ kiện](/accessories).'
      : 'No exact matching accessories were found in stock right now. Browse all lowering kits and riding gear on the [Accessories](/accessories) page.';
  }

  const lines = matchedAccessories.map((acc) => {
    const link = `**${formatAccessoryLink(acc.name, acc.sku)}**`;
    const cat = formatAccessoryCategoryLabel(acc.category, locale);
    return isVi
      ? `- ${link} (${cat}) — Giá: **${formatMoney(acc.priceVnd, 'vi')}** | Còn **${acc.availableQty}** sản phẩm`
      : `- ${link} (${cat}) — Price: **${formatMoney(acc.priceVnd, 'en')}** | **${acc.availableQty}** available`;
  });

  return (
    (isVi
      ? '**Phụ kiện & đồ bảo hộ đang có sẵn tại DirtFit Commerce:**'
      : '**Accessories & riding gear available at DirtFit Commerce:**') +
    '\n\n' +
    lines.join('\n')
  );
}

function formatCatalogResponse(groundedContext) {
  const {
    locale,
    matchedCatalogBikes,
    matchedAccessories,
    liveBikes,
    catalogScopeStatus,
    catalogEntities,
    historyRiderProfile,
  } = groundedContext;
  const isVi = locale === 'vi';

  if (catalogScopeStatus === 'UNSTOCKED_BRAND') {
    return formatUnstockedBrandResponse(groundedContext);
  }

  if (catalogScopeStatus === 'SCOPED_ACCESSORY') {
    return formatAccessoriesOnlyResponse(groundedContext);
  }

  const bikes = matchedCatalogBikes.length > 0 ? matchedCatalogBikes : liveBikes.slice(0, 4);

  if (bikes.length === 0) {
    return isVi
      ? 'Hiện danh mục xe đang được cập nhật. Vui lòng xem lại tại trang [Xe địa hình](/bikes).'
      : 'Our live motorcycle catalog is currently being updated. Please check back on [Motorcycles](/bikes).';
  }

  const specFocus = catalogEntities?.specFocus ?? 'GENERAL';
  const brandLabel = resolveRequestedBrandDisplay(groundedContext);

  if (specFocus === 'SEAT_HEIGHT') {
    const lines = bikes.map((bike) => {
      const seat = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
      const width = bike.geometrySpec?.seatWidthMm;
      const widthNote = width
        ? isVi
          ? ` (bề ngang yên \`${width} mm\`)`
          : ` (seat width \`${width} mm\`)`
        : '';
      const catLabel = formatCategoryLabel(bike.category, locale);
      const bikeLink = `**${formatBikeLink(bike)}**`;
      return isVi
        ? `- ${bikeLink} (${catLabel}) — Chiều cao yên nguyên bản: **${seat} mm**${widthNote} | Giá: **${formatMoney(bike.priceVnd, 'vi')}** | Còn **${bike.availableQty}** xe`
        : `- ${bikeLink} (${catLabel}) — Unladen seat height: **${seat} mm**${widthNote} | Price: **${formatMoney(bike.priceVnd, 'en')}** | **${bike.availableQty}** in stock`;
    });

    const header = isVi
      ? `Thông số **chiều cao yên nguyên bản** của ${bikes.length === 1 ? 'mẫu xe' : 'các mẫu xe'}${brandLabel ? ` **${brandLabel}**` : ''}:`
      : `**Unladen seat height specs** for${brandLabel ? ` **${brandLabel}**` : ' matching motorcycles'}:`;

    let followUpHint = '';
    if (historyRiderProfile?.heightCm) {
      const h = Math.round(historyRiderProfile.heightCm);
      const wNote = historyRiderProfile.weightKg
        ? ` / ${Math.round(historyRiderProfile.weightKg)} kg`
        : '';
      const targetSubject = brandLabel || bikes[0].name;
      followUpHint = isVi
        ? `\n\nNếu bạn muốn tính chiều cao yên thực tế sau độ lún phuộc theo vóc dáng **${h} cm${wNote}**, hãy nhắn **"Tôi đi vừa ${targetSubject} không?"** nhé!`
        : `\n\nWant to check effective seat height after suspension sag for **${h} cm${wNote}**? Just ask **"Does ${targetSubject} fit me?"**.`;
    }

    return `${header}\n\n${lines.join('\n')}${followUpHint}`;
  }

  if (specFocus === 'WEIGHT') {
    const lines = bikes.map((bike) => {
      const wetWeight = bike.geometrySpec?.wetWeightKg ?? 'N/A';
      const seat = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
      const catLabel = formatCategoryLabel(bike.category, locale);
      const bikeLink = `**${formatBikeLink(bike)}**`;
      return isVi
        ? `- ${bikeLink} (${catLabel} · ${bike.engineCc}cc) — Trọng lượng ướt: **${wetWeight} kg** | Yên: \`${seat} mm\` | Giá: **${formatMoney(bike.priceVnd, 'vi')}**`
        : `- ${bikeLink} (${catLabel} · ${bike.engineCc}cc) — Wet weight: **${wetWeight} kg** | Seat: \`${seat} mm\` | Price: **${formatMoney(bike.priceVnd, 'en')}**`;
    });
    const header = isVi
      ? `**Thông số trọng lượng${brandLabel ? ` xe ${brandLabel}` : ''} từ DirtFit Catalog:**`
      : `**Weight specifications${brandLabel ? ` for ${brandLabel}` : ''} from DirtFit Catalog:**`;
    return `${header}\n\n${lines.join('\n')}`;
  }

  const lines = bikes.map((bike) => {
    const seat = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
    const catLabel = formatCategoryLabel(bike.category, locale);
    const bikeLink = `**${formatBikeLink(bike)}**`;
    if (isVi) {
      return `- ${bikeLink} (${catLabel} · ${bike.engineCc}cc) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** | Đặt cọc: **${formatMoney(bike.depositAmountVnd, 'vi')}** | Yên tiêu chuẩn: \`${seat} mm\` | Tồn kho khả dụng: **${bike.availableQty}**`;
    }
    return `- ${bikeLink} (${catLabel} · ${bike.engineCc}cc) — Price: **${formatMoney(bike.priceVnd, 'en')}** | Deposit: **${formatMoney(bike.depositAmountVnd, 'en')}** | Unladen seat: \`${seat} mm\` | Available: **${bike.availableQty}**`;
  });

  let header;
  if (catalogScopeStatus === 'SCOPED_BRAND' && brandLabel) {
    header = isVi
      ? `Có! Hiện **DirtFit Commerce** đang có sẵn ${bikes.length === 1 ? 'mẫu xe' : 'các mẫu xe'} **${brandLabel}** sau:`
      : `Yes! **DirtFit Commerce** currently has the following **${brandLabel}** motorcycle(s) available:`;
  } else {
    header = isVi
      ? '**Thông tin giá bán & tồn kho trực tiếp từ DirtFit Catalog:**'
      : '**Live pricing & availability from DirtFit Catalog:**';
  }

  const accSuffix =
    matchedAccessories.length > 0
      ? (isVi
          ? '\n\n**Phụ kiện tương thích sẵn kho:**\n'
          : '\n\n**Compatible accessories in stock:**\n') +
        matchedAccessories
          .slice(0, 3)
          .map(
            (acc) =>
              `- **${formatAccessoryLink(acc.name, acc.sku)}** — **${formatMoney(acc.priceVnd, locale)}**`
          )
          .join('\n')
      : '';

  const compareSuffix =
    matchedCatalogBikes.length >= 2
      ? isVi
        ? `\n\nBạn có thể đặt hai mẫu xe cạnh nhau tại [So sánh 2D Ghost Overlay](/compare?bikeA=${encodeURIComponent(bikes[0].slug)}&bikeB=${encodeURIComponent(bikes[1].slug)}).`
        : `\n\nCompare geometry side-by-side in [Compare in 2D Ghost Overlay](/compare?bikeA=${encodeURIComponent(bikes[0].slug)}&bikeB=${encodeURIComponent(bikes[1].slug)}).`
      : '';

  return `${header}\n\n${lines.join('\n')}${accSuffix}${compareSuffix}`;
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

  const lines = scopedOrders.map((o) => {
    const typeLabel = formatOrderTypeLabel(o.orderType, locale);
    const statusLabel = formatOrderStatusLabel(o.status, locale);
    return isVi
      ? `- Đơn **${o.orderNumber}** (${typeLabel}) — Trạng thái: **${statusLabel}** · Tổng: **${formatMoney(o.totalVnd, 'vi')}** · Thanh toán ngay: **${formatMoney(o.payableNowVnd, 'vi')}**`
      : `- Order **${o.orderNumber}** (${typeLabel}) — Status: **${statusLabel}** · Total: **${formatMoney(o.totalVnd, 'en')}** · Payable now: **${formatMoney(o.payableNowVnd, 'en')}**`;
  });

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
      '- **Tư vấn chọn xe theo vóc dáng (Rider Fit 2D):** Nhập chiều cao & cân nặng (ví dụ: *"Cao 1m68 nặng 65kg đi xe nào?"*) để hệ thống mô phỏng độ lún phuộc và mức chống chân thực tế.\n' +
      '- **Báo giá, tồn kho & phụ kiện hạ yên:** Hỏi trực tiếp hãng xe hoặc mẫu xe (KTM, Honda CRF, Yamaha WR/Ténéré, Kawasaki KLX, Husqvarna FE) hay nhu cầu mua xe.\n' +
      '- **Đặt cọc PayOS VietQR, luật COD, bảo hành & lịch lái thử:** Tại 3 showroom Hà Nội, Đà Nẵng và TP.HCM.'
    );
  }

  return (
    'Hello! I am the **DirtFit Commerce** Technical Assistant. I can help you right away with:\n\n' +
    '- **2D Rider Fit Sizing:** Share your height & weight (e.g., *"I\'m 168cm 65kg, which bike fits me?"*) for real suspension sag and foot-reach scoring.\n' +
    '- **Live Bike Pricing, Stock & Lowering Kits:** Ask about any off-road/dual-sport/adventure brand or model (KTM, Honda CRF, Yamaha WR/Ténéré, Kawasaki KLX, Husqvarna FE).\n' +
    '- **Deposits, COD Rules, Warranty & Test Rides:** PayOS VietQR 15-minute holds and showroom bookings in Hanoi, Da Nang, and HCMC.'
  );
}

function formatGeneralPurchaseResponse(groundedContext) {
  const { locale, matchedCatalogBikes, liveBikes } = groundedContext;
  const isVi = locale === 'vi';
  const bikes = matchedCatalogBikes.length > 0 ? matchedCatalogBikes : liveBikes.slice(0, 4);
  const simBrand = getSimulatorBrandName(locale);

  const catalogLines = bikes.map((bike) => {
    const seat = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
    const catLabel = formatCategoryLabel(bike.category, locale);
    const bikeLink = `**${formatBikeLink(bike)}**`;
    if (isVi) {
      return `- ${bikeLink} (${catLabel} · ${bike.engineCc}cc) — Giá: **${formatMoney(bike.priceVnd, 'vi')}** | Yên: \`${seat} mm\` | Còn **${bike.availableQty}** xe`;
    }
    return `- ${bikeLink} (${catLabel} · ${bike.engineCc}cc) — Price: **${formatMoney(bike.priceVnd, 'en')}** | Seat: \`${seat} mm\` | **${bike.availableQty}** available`;
  });

  if (isVi) {
    const body =
      catalogLines.length > 0
        ? `\n\n${catalogLines.join('\n')}`
        : '\n\nHiện danh mục xe đang được cập nhật trực tiếp trên trang [Xe địa hình](/bikes).';
    return (
      'Rất vui được tư vấn chọn xe phù hợp cho bạn tại **DirtFit Commerce**! Một số mẫu xe tiêu biểu theo từng phân khúc hiện có:' +
      body +
      `\n\nĐể tôi tính chính xác mức **chống chân & độ lún phuộc (Rider Sag)** qua ${simBrand}, bạn vui lòng cho biết thêm **chiều cao (cm)**, **cân nặng (kg)** và **địa hình chạy chính** (đi phố/tour nhẹ Dual-Sport, off-road Enduro/Motocross hay đường dài Adventure) nhé!`
    );
  }

  const body =
    catalogLines.length > 0
      ? `\n\n${catalogLines.join('\n')}`
      : '\n\nYou can browse our latest stock on the [Motorcycles](/bikes) page.';
  return (
    'I would be glad to help you choose the right motorcycle at **DirtFit Commerce**! Here are representative live models across our segments:' +
    body +
    `\n\nTo calculate your exact **2D foot contact and suspension sag** with our ${simBrand}, please share your **height (cm)**, **weight (kg)**, and **primary terrain** (Dual-Sport street/trail, Enduro/MX off-road, or Adventure touring).`
  );
}

/**
 * Deterministic Zero-Key Grounded Fallback Adapter.
 * Generates strictly grounded EN/VI responses from Policy KB, CatalogCache, and Ergonomics Physics
 * using natural human-readable labels with zero raw enums or internal package identifiers.
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
