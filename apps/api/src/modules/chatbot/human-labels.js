const CATEGORY_LABELS = Object.freeze({
  DUAL_SPORT: Object.freeze({ en: 'Dual-Sport', vi: 'Dual-Sport (Đa địa hình)' }),
  MOTOCROSS: Object.freeze({ en: 'Motocross', vi: 'Motocross (Cào cào thi đấu)' }),
  ENDURO: Object.freeze({ en: 'Enduro', vi: 'Enduro (Địa hình kỹ thuật)' }),
  ADVENTURE: Object.freeze({ en: 'Adventure', vi: 'Adventure (Touring địa hình)' }),
  SUPERMOTO: Object.freeze({ en: 'Supermoto', vi: 'Supermoto' }),
});

const CONTACT_LABELS = Object.freeze({
  FLAT_FOOT: Object.freeze({
    en: 'Flat-foot both sides',
    vi: 'Chống phẳng cả hai bàn chân',
  }),
  FLAT_FOOT_BOTH: Object.freeze({
    en: 'Flat-foot both sides',
    vi: 'Chống phẳng cả hai bàn chân',
  }),
  BALLS_OF_FEET: Object.freeze({
    en: 'Balls of both feet',
    vi: 'Chống phần ức bàn chân vững',
  }),
  TIP_TOE: Object.freeze({
    en: 'Tiptoes both sides',
    vi: 'Nhón mũi hai chân',
  }),
  TIPTOES_BOTH: Object.freeze({
    en: 'Tiptoes both sides',
    vi: 'Nhón mũi hai chân',
  }),
  ONE_FOOT_SHIFT: Object.freeze({
    en: 'One foot down (hip shift)',
    vi: 'Chống một chân nghiêng xe',
  }),
  ONE_FOOT_DOWN: Object.freeze({
    en: 'One foot down (hip shift)',
    vi: 'Chống một chân nghiêng xe',
  }),
  TOO_TALL_UNSAFE: Object.freeze({
    en: 'Very tall — lowering kit recommended',
    vi: 'Yên rất cao — nên hạ yên/phuộc',
  }),
  EXTREME_HEIGHT_WARNING: Object.freeze({
    en: 'Very tall — lowering kit recommended',
    vi: 'Yên rất cao — nên hạ yên/phuộc',
  }),
});

const FOOTWEAR_LABELS = Object.freeze({
  SNEAKERS: Object.freeze({ en: 'sneakers', vi: 'giày thể thao' }),
  ADV_BOOTS: Object.freeze({ en: 'ADV boots', vi: 'giày bảo hộ ADV' }),
  MX_BOOTS: Object.freeze({ en: 'MX boots', vi: 'giày bảo hộ MX' }),
  BAREFOOT: Object.freeze({ en: 'barefoot', vi: 'chân trần' }),
});

const ORDER_TYPE_LABELS = Object.freeze({
  BIKE_DEPOSIT: Object.freeze({ en: 'Bike Deposit', vi: 'Đặt cọc xe' }),
  FULL_PURCHASE: Object.freeze({ en: 'Full Purchase', vi: 'Thanh toán toàn phần' }),
  ACCESSORY_ONLY: Object.freeze({ en: 'Accessories', vi: 'Phụ kiện' }),
});

const ORDER_STATUS_LABELS = Object.freeze({
  PENDING_PAYMENT: Object.freeze({ en: 'Pending Payment', vi: 'Chờ thanh toán' }),
  DEPOSIT_PAID: Object.freeze({ en: 'Deposit Paid', vi: 'Đã đặt cọc' }),
  PAID: Object.freeze({ en: 'Paid in Full', vi: 'Đã thanh toán đủ' }),
  CONFIRMED: Object.freeze({ en: 'Confirmed (COD)', vi: 'Đã xác nhận (COD)' }),
  PREPARING: Object.freeze({ en: 'Preparing / PDI', vi: 'Đang chuẩn bị xe / PDI' }),
  READY_FOR_HANDOVER: Object.freeze({ en: 'Ready for Handover', vi: 'Sẵn sàng bàn giao' }),
  SHIPPING: Object.freeze({ en: 'Shipping', vi: 'Đang vận chuyển' }),
  COMPLETED: Object.freeze({ en: 'Completed', vi: 'Hoàn tất' }),
  CANCELLED: Object.freeze({ en: 'Cancelled', vi: 'Đã hủy' }),
  EXPIRED: Object.freeze({ en: 'Hold Expired', vi: 'Hết hạn giữ chỗ' }),
  REFUNDED: Object.freeze({ en: 'Refunded', vi: 'Đã hoàn tiền' }),
});

const ACCESSORY_CATEGORY_LABELS = Object.freeze({
  LOWERING_LINK: Object.freeze({ en: 'Lowering Link', vi: 'Link hạ phuộc' }),
  LOW_SEAT: Object.freeze({ en: 'Low Seat', vi: 'Yên thấp' }),
  BAR_RISER: Object.freeze({ en: 'Handlebar Riser', vi: 'Nâng ghi đông' }),
  FOOTPEG_LOWER: Object.freeze({ en: 'Lowered Footpegs', vi: 'Hạ gác chân' }),
  SHOCK_SPRING: Object.freeze({ en: 'Shock Spring', vi: 'Lò xo phuộc' }),
  PROTECTION: Object.freeze({ en: 'Bike Protection', vi: 'Bảo vệ xe' }),
  APPAREL: Object.freeze({ en: 'Riding Gear & MX Boots', vi: 'Đồ bảo hộ / Giày MX' }),
  EXHAUST: Object.freeze({ en: 'Exhaust System', vi: 'Hệ thống xả' }),
  OTHER: Object.freeze({ en: 'Accessory', vi: 'Phụ kiện khác' }),
});

const SHOWROOM_CODE_LABELS = Object.freeze({
  HN_LONG_BIEN: Object.freeze({ en: 'Hanoi — Long Bien', vi: 'Hà Nội — Long Biên' }),
  DN_SON_TRA: Object.freeze({ en: 'Da Nang — Son Tra', vi: 'Đà Nẵng — Sơn Trà' }),
  HCM_THU_DUC: Object.freeze({ en: 'HCMC — Thu Duc', vi: 'TP.HCM — Thủ Đức' }),
});

const ALL_RAW_ENUM_LABELS = Object.freeze({
  ...CATEGORY_LABELS,
  ...CONTACT_LABELS,
  ...FOOTWEAR_LABELS,
  ...ORDER_TYPE_LABELS,
  ...ORDER_STATUS_LABELS,
  ...ACCESSORY_CATEGORY_LABELS,
  ...SHOWROOM_CODE_LABELS,
});

const REDUNDANT_PAREN_CONTACT_REGEX =
  /(\S)[ \t]*\((?:FLAT_FOOT|FLAT_FOOT_BOTH|BALLS_OF_FEET|TIP_TOE|TIPTOES_BOTH|ONE_FOOT_SHIFT|ONE_FOOT_DOWN|TOO_TALL_UNSAFE|EXTREME_HEIGHT_WARNING)\)/g;

const RAW_ENUM_TOKEN_REGEX = new RegExp(
  `\\b(${Object.keys(ALL_RAW_ENUM_LABELS)
    .sort((a, b) => b.length - a.length)
    .join('|')})\\b`,
  'g'
);

const MARKDOWN_LINK_CAPTURE_REGEX = /(\[[^\]\n]{1,140}\]\((?:[^()\s]|\([^()\s]*\)){1,220}\))/g;
const MARKDOWN_LINK_PARTS_REGEX = /^\[([^\]\n]{1,140})\]\(((?:[^()\s]|\([^()\s]*\)){1,220})\)$/;

function pickLocalized(map, key, locale) {
  const entry = map[key];
  if (!entry) {
    return key;
  }
  return locale === 'vi' ? entry.vi : entry.en;
}

/**
 * Format motorcycle category enum into natural EN/VI copy.
 * @param {string} category
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatCategoryLabel(category, locale = 'en') {
  return pickLocalized(CATEGORY_LABELS, category, locale);
}

/**
 * Format foot-contact status enum into natural EN/VI copy without raw enum suffixes.
 * @param {string} status
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatContactLabel(status, locale = 'en') {
  return pickLocalized(CONTACT_LABELS, status, locale);
}

/**
 * Format footwear type enum into natural EN/VI copy.
 * @param {string} footwear
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatFootwearLabel(footwear, locale = 'en') {
  return pickLocalized(FOOTWEAR_LABELS, footwear, locale);
}

/**
 * Format order type enum into natural EN/VI copy.
 * @param {string} orderType
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatOrderTypeLabel(orderType, locale = 'en') {
  return pickLocalized(ORDER_TYPE_LABELS, orderType, locale);
}

/**
 * Format order status enum into natural EN/VI copy.
 * @param {string} status
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatOrderStatusLabel(status, locale = 'en') {
  return pickLocalized(ORDER_STATUS_LABELS, status, locale);
}

/**
 * Format accessory category enum into natural EN/VI copy.
 * @param {string} category
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatAccessoryCategoryLabel(category, locale = 'en') {
  return pickLocalized(ACCESSORY_CATEGORY_LABELS, category, locale);
}

/**
 * Format showroom code enum into natural EN/VI city/district name.
 * @param {string} code
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function formatShowroomCodeLabel(code, locale = 'en') {
  return pickLocalized(SHOWROOM_CODE_LABELS, code, locale);
}

/**
 * Return customer-facing DirtFit 2D simulator name (never exposing internal `@dirtfit/*` package names).
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function getSimulatorBrandName(locale = 'en') {
  return locale === 'vi' ? 'hệ thống mô phỏng tư thế 2D DirtFit' : 'DirtFit 2D Rider Fit simulator';
}

function humanizePlainSegment(segment, locale) {
  if (!segment) {
    return '';
  }

  const simName = getSimulatorBrandName(locale);
  let out = segment
    .replace(/`?@dirtfit\/ergonomics-engine`?/gi, simName)
    .replace(/`?@dirtfit\/(?:knowledge|shared|api|web)`?/gi, 'DirtFit Commerce')
    .replace(REDUNDANT_PAREN_CONTACT_REGEX, '$1');

  out = out.replace(RAW_ENUM_TOKEN_REGEX, (token) =>
    pickLocalized(ALL_RAW_ENUM_LABELS, token, locale)
  );

  return out;
}

/**
 * Defense-in-depth post-processor ensuring zero raw UPPER_SNAKE_CASE enums or internal `@dirtfit/*`
 * package names leak into customer-facing chat copy, while preserving all Markdown link URLs verbatim.
 * @param {string} text
 * @param {'en'|'vi'} [locale]
 * @returns {string}
 */
export function humanizeAssistantCopy(text, locale = 'en') {
  if (typeof text !== 'string' || text.length === 0) {
    return typeof text === 'string' ? text : '';
  }

  const safeLocale = locale === 'vi' ? 'vi' : 'en';
  const parts = text.split(MARKDOWN_LINK_CAPTURE_REGEX);

  return parts
    .map((part) => {
      if (!part) {
        return '';
      }
      const linkMatch = part.match(MARKDOWN_LINK_PARTS_REGEX);
      if (linkMatch) {
        const cleanedLabel = humanizePlainSegment(linkMatch[1], safeLocale);
        return `[${cleanedLabel}](${linkMatch[2]})`;
      }
      return humanizePlainSegment(part, safeLocale);
    })
    .join('');
}
