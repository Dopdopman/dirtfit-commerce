import { POLICY_DOC_SLUGS } from '@dirtfit/knowledge/constants';
import { foldVietnameseText } from '@dirtfit/knowledge/retriever';
import { BIKE_CATEGORIES, CHAT_INTENTS, FOOTWEAR_TYPES } from '@dirtfit/shared';

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordToken(foldedText, token) {
  const clean = foldVietnameseText(String(token ?? '')).trim();
  if (!clean) {
    return false;
  }
  const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(clean)}(?=$|[^a-z0-9])`, 'i');
  return re.test(foldedText);
}

const VIETNAMESE_DIACRITIC_REGEX =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const UNACCENTED_VI_REGEX =
  /\b(alo+|a lo|xin chao|chao shop|chao ad|chao admin|chao ban|co ai khong|shop oi|ad oi|toi muon|minh muon|muon mua|can mua|can tu van|tu van|gia xe|hoi gia|bao nhieu|dat coc|coc xe|chieu cao|can nang|chong chan|lai thu|phu kien|ha yen|bao hanh|dieu khoan|don hang|xe nao|mua xe|cho minh hoi|viet code|co xe|co san pham|san pham cua|ben shop|ban xe|cao yen|yen xe|trong luong|di vua|co vua|ngoi vua)\b/i;

const CLEAR_EN_REGEX =
  /\b(hello|hi there|hey|good morning|good afternoon|good evening|how much|how do|how does|which bike|want to buy|buy a bike|buy a motorcycle|looking for|recommend|deposit|warranty|returns|terms|privacy|test ride|seat height|fits me|fit me|check my order|order status|what is|can i|do you)\b/i;

const CLEAR_OFF_TOPIC_REGEX =
  /\b(viet code|lap trinh|python|javascript|typescript|c\+\+|java\b|html|css|sql|sort mang|thuat toan|algorithm|quantum computing|thoi tiet|weather|du bao thoi tiet|chung khoan|bitcoin|crypto|chinh tri|politics|nau an|recipe|chua benh|medical advice)\b/i;

const BRAND_ALIAS_TO_SLUG = Object.freeze({
  husky: 'husqvarna',
  hqv: 'husqvarna',
  kawa: 'kawasaki',
  klx: 'kawasaki',
  crf: 'honda',
  tenere: 'yamaha',
  wr155: 'yamaha',
  exc: 'ktm',
  excf: 'ktm',
  'exc-f': 'ktm',
});

const COMPETITOR_BRANDS = Object.freeze([
  { key: 'ducati', label: 'Ducati' },
  { key: 'bmw', label: 'BMW' },
  { key: 'suzuki', label: 'Suzuki' },
  { key: 'triumph', label: 'Triumph' },
  { key: 'aprilia', label: 'Aprilia' },
  { key: 'beta', label: 'Beta' },
  { key: 'gasgas', label: 'GasGas' },
  { key: 'sherco', label: 'Sherco' },
  { key: 'cfmoto', label: 'CFMoto' },
  { key: 'cf moto', label: 'CFMoto' },
  { key: 'benelli', label: 'Benelli' },
  { key: 'royal enfield', label: 'Royal Enfield' },
  { key: 'harley-davidson', label: 'Harley-Davidson' },
  { key: 'harley', label: 'Harley-Davidson' },
  { key: 'vespa', label: 'Vespa' },
  { key: 'piaggio', label: 'Piaggio' },
]);

const ACCESSORY_BRAND_ALIASES = Object.freeze([
  'alpinestars',
  'zeta',
  'zeta racing',
  'soubeyras',
  'lust racing',
  'seat concepts',
  'powerparts',
  'rox',
  'rox speed fx',
  'wp',
  'wp pro',
]);

const ACCESSORY_KEYWORD_REGEX =
  /\b(phu kien|accessories|accessory|do bao ho|giay mx|giay bao ho|ung mx|ung bao ho|mx boots?|adv boots?|link ha phuoc|lowering link|lowering kit|yen thap|low seat|nang ghi dong|bar riser|lo xo phuoc|shock spring)\b/i;

const BROAD_PRODUCT_QUERY_REGEX = /\b(san pham|products?)\b/i;

const SPEC_SEAT_HEIGHT_REGEX =
  /\b(chieu cao yen|do cao yen|yen cao bao nhieu|yen bao nhieu|cao yen|seat height|unladen seat)\b/i;
const SPEC_WEIGHT_REGEX =
  /\b(trong luong|nang bao nhieu|can nang cua xe|xe nang|wet weight|curb weight|how heavy)\b/i;
const SPEC_PRICE_REGEX =
  /\b(gia ban|gia xe|hoi gia|gia bao nhieu|bao nhieu tien|price|cost|how much)\b/i;
const SPEC_STOCK_REGEX =
  /\b(ton kho|con hang|con xe|co hang|san kho|stock|available|availability|in stock)\b/i;
const SPEC_TECHNICAL_REGEX =
  /\b(thong so|specs?|specification|phan khoi|dung tich|bao nhieu cc|ma luc|khoang sang gam|ground clearance|hanh trinh phuoc|suspension travel|binh xang|fuel capacity)\b/i;

const ACCESSORY_COMMERCE_SIGNAL_REGEX =
  /\b(gia|bao nhieu|co ban|co khong|co hang|con hang|ton kho|mua|price|cost|buy|stock|available|do you have|do you sell|do you carry)\b/i;

/**
 * Resolve effective response locale (`'en'` | `'vi'`) prioritizing the actual language of the user message,
 * falling back cleanly to `uiLocale` for neutral/short model-name or measurement messages.
 * @param {string} message
 * @param {'en'|'vi'} [uiLocale]
 * @returns {'en'|'vi'}
 */
export function resolveEffectiveLocale(message, uiLocale = 'en') {
  const raw = String(message ?? '').trim();
  const fallbackLocale = uiLocale === 'vi' ? 'vi' : 'en';

  if (!raw) {
    return fallbackLocale;
  }

  if (VIETNAMESE_DIACRITIC_REGEX.test(raw)) {
    return 'vi';
  }

  const folded = foldVietnameseText(raw);
  if (UNACCENTED_VI_REGEX.test(folded)) {
    return 'vi';
  }

  if (CLEAR_EN_REGEX.test(folded)) {
    return 'en';
  }

  return fallbackLocale;
}

/**
 * Extract rider body dimensions, footwear, and motorcycle category preference from EN/VI free text.
 * Supports formats such as `1m68`, `1.68m`, `168cm`, `65kg`, `65 cân`, `inseam 78cm`, `MX boots`.
 * @param {string} message
 * @returns {{
 *   heightCm: number|null,
 *   weightKg: number|null,
 *   inseamCm: number|null,
 *   footwear: string|null,
 *   category: string|null,
 *   hasExplicitDimensions: boolean,
 * }}
 */
export function extractRiderEntities(message) {
  const folded = foldVietnameseText(String(message ?? ''));

  let heightCm = null;
  const meterCompactMatch = folded.match(/\b([12])\s*m\s*(\d{1,2})\b/);
  if (meterCompactMatch) {
    const meters = Number(meterCompactMatch[1]);
    const fracStr = meterCompactMatch[2];
    const cmPart = fracStr.length === 1 ? Number(fracStr) * 10 : Number(fracStr);
    const candidate = meters * 100 + cmPart;
    if (candidate >= 120 && candidate <= 230) {
      heightCm = clampNumber(candidate, 135, 220);
    }
  }

  if (heightCm === null) {
    const meterDecimalMatch = folded.match(/\b([12])[.,](\d{1,2})\s*m(?:et|eters?)?\b/);
    if (meterDecimalMatch) {
      const meters = Number(meterDecimalMatch[1]);
      const fracStr = meterDecimalMatch[2];
      const cmPart = fracStr.length === 1 ? Number(fracStr) * 10 : Number(fracStr);
      const candidate = meters * 100 + cmPart;
      if (candidate >= 120 && candidate <= 230) {
        heightCm = clampNumber(candidate, 135, 220);
      }
    }
  }

  if (heightCm === null) {
    const cmMatch =
      folded.match(/\b(\d{3})\s*(?:cm|centimeters?)\b/) ||
      folded.match(/\b(?:cao|height|tall)\s*(?:la|:|=)?\s*(\d{3})\b/);
    if (cmMatch) {
      const candidate = Number(cmMatch[1]);
      if (candidate >= 120 && candidate <= 230) {
        heightCm = clampNumber(candidate, 135, 220);
      }
    }
  }

  let weightKg = null;
  const kgMatch =
    folded.match(/\b(\d{2,3})\s*(?:kg|kgs|can|ky|kilograms?)\b/) ||
    folded.match(/\b(?:nang|weigh|weight)\s*(?:la|:|=)?\s*(\d{2,3})\b/);
  if (kgMatch) {
    const candidate = Number(kgMatch[1]);
    if (candidate >= 30 && candidate <= 200) {
      weightKg = clampNumber(candidate, 35, 160);
    }
  }

  let inseamCm = null;
  const inseamMatch =
    folded.match(/\b(?:inseam|dung|chieu dai chan)\s*(?:la|:|=)?\s*(\d{2,3})\s*(?:cm)?\b/) ||
    folded.match(/\b(\d{2,3})\s*cm\s*inseam\b/);
  if (inseamMatch) {
    const candidate = Number(inseamMatch[1]);
    if (candidate >= 50 && candidate <= 125) {
      inseamCm = clampNumber(candidate, 55, 115);
    }
  }

  let footwear = null;
  if (/\b(mx boots?|motocross boots?|giay mx|giay cao cao)\b/.test(folded)) {
    footwear = FOOTWEAR_TYPES.MX_BOOTS;
  } else if (/\b(adv boots?|adventure boots?|giay adv|giay tour)\b/.test(folded)) {
    footwear = FOOTWEAR_TYPES.ADV_BOOTS;
  } else if (/\b(sneakers?|giay the thao|giay thuong)\b/.test(folded)) {
    footwear = FOOTWEAR_TYPES.SNEAKERS;
  }

  let category = null;
  if (/\b(dual[- ]?sport)\b/.test(folded)) {
    category = BIKE_CATEGORIES.DUAL_SPORT;
  } else if (/\b(motocross|mx bike|san dua)\b/.test(folded)) {
    category = BIKE_CATEGORIES.MOTOCROSS;
  } else if (/\b(enduro)\b/.test(folded)) {
    category = BIKE_CATEGORIES.ENDURO;
  } else if (/\b(adventure|\badv\b)\b/.test(folded)) {
    category = BIKE_CATEGORIES.ADVENTURE;
  } else if (/\b(supermoto)\b/.test(folded)) {
    category = BIKE_CATEGORIES.SUPERMOTO;
  }

  return {
    heightCm,
    weightKg,
    inseamCm,
    footwear,
    category,
    hasExplicitDimensions: heightCm !== null || weightKg !== null || inseamCm !== null,
  };
}

function resolveBikeBrandSlug(bike) {
  if (bike?.brand?.slug) {
    return String(bike.brand.slug).trim().toLowerCase();
  }
  if (bike?.brand?.name) {
    return foldVietnameseText(bike.brand.name)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  if (bike?.name) {
    return foldVietnameseText(String(bike.name).split(/\s+/)[0] ?? '');
  }
  return '';
}

function collectAccessoriesPool(catalogBikes = [], catalogAccessories = []) {
  const bySku = new Map();
  if (Array.isArray(catalogAccessories)) {
    for (const acc of catalogAccessories) {
      if (acc?.sku && acc?.name) {
        bySku.set(String(acc.sku).trim().toUpperCase(), acc);
      }
    }
  }
  if (Array.isArray(catalogBikes)) {
    for (const bike of catalogBikes) {
      for (const comp of bike?.compatibilities ?? []) {
        const acc = comp?.accessory;
        if (acc?.sku && acc?.name) {
          const key = String(acc.sku).trim().toUpperCase();
          if (!bySku.has(key)) {
            bySku.set(key, acc);
          }
        }
      }
    }
  }
  return Array.from(bySku.values());
}

/**
 * Dynamically extract stocked brands, unstocked competitor brands, accessory queries, and spec focus.
 * Pure JS, zero DB/network calls.
 * @param {string} message
 * @param {Array<object>} [catalogBikes]
 * @param {Array<object>} [catalogAccessories]
 * @returns {{
 *   requestedBrands: string[],
 *   unstockedBrands: string[],
 *   matchedAccessorySkus: string[],
 *   requestedAccessoryBrands: string[],
 *   hasAccessoryQuery: boolean,
 *   asksProductsBroadly: boolean,
 *   specFocus: 'SEAT_HEIGHT'|'WEIGHT'|'PRICE'|'STOCK'|'SPECS'|'ACCESSORY'|'GENERAL',
 * }}
 */
export function extractCatalogEntities(message, catalogBikes = [], catalogAccessories = []) {
  const folded = foldVietnameseText(String(message ?? ''));
  const compactMsg = folded.replace(/[^a-z0-9]+/g, '');

  const stockedBrandMap = new Map();
  if (Array.isArray(catalogBikes)) {
    for (const bike of catalogBikes) {
      const brandSlug = resolveBikeBrandSlug(bike);
      if (!brandSlug) {
        continue;
      }
      const brandName = foldVietnameseText(bike?.brand?.name ?? brandSlug).trim();
      if (!stockedBrandMap.has(brandSlug)) {
        stockedBrandMap.set(brandSlug, brandName);
      }
    }
  }

  const requestedBrandsSet = new Set();
  for (const [brandSlug, brandName] of stockedBrandMap.entries()) {
    if (hasWordToken(folded, brandSlug) || hasWordToken(folded, brandName)) {
      requestedBrandsSet.add(brandSlug);
    }
  }

  for (const [alias, targetSlug] of Object.entries(BRAND_ALIAS_TO_SLUG)) {
    if (stockedBrandMap.has(targetSlug) && hasWordToken(folded, alias)) {
      requestedBrandsSet.add(targetSlug);
    }
  }

  if (
    stockedBrandMap.has('husqvarna') &&
    (/\bfe\s*350\b/i.test(folded) || compactMsg.includes('fe350'))
  ) {
    requestedBrandsSet.add('husqvarna');
  }

  const unstockedBrandsSet = new Set();
  for (const competitor of COMPETITOR_BRANDS) {
    const slugKey = competitor.key.replace(/\s+/g, '-');
    if (stockedBrandMap.has(slugKey) || stockedBrandMap.has(competitor.key)) {
      continue;
    }
    if (hasWordToken(folded, competitor.key)) {
      unstockedBrandsSet.add(competitor.label);
    }
  }

  const accessoriesPool = collectAccessoriesPool(catalogBikes, catalogAccessories);
  const matchedAccessorySkusSet = new Set();
  const requestedAccessoryBrandsSet = new Set();

  for (const acc of accessoriesPool) {
    const sku = String(acc.sku).trim();
    const foldedSku = foldVietnameseText(sku);
    const foldedName = foldVietnameseText(acc.name);
    const foldedBrand = foldVietnameseText(acc.brandName ?? '').trim();

    if (
      hasWordToken(folded, foldedSku) ||
      (foldedName.length >= 6 && folded.includes(foldedName)) ||
      (foldedBrand.length >= 2 && hasWordToken(folded, foldedBrand))
    ) {
      matchedAccessorySkusSet.add(sku);
      if (foldedBrand && hasWordToken(folded, foldedBrand)) {
        requestedAccessoryBrandsSet.add(acc.brandName);
      }
    }
  }

  for (const alias of ACCESSORY_BRAND_ALIASES) {
    if (hasWordToken(folded, alias)) {
      requestedAccessoryBrandsSet.add(alias);
      for (const acc of accessoriesPool) {
        const foldedAcc = foldVietnameseText(`${acc.name} ${acc.brandName ?? ''}`);
        if (hasWordToken(foldedAcc, alias)) {
          matchedAccessorySkusSet.add(String(acc.sku).trim());
        }
      }
    }
  }

  const hasAccessoryQuery =
    ACCESSORY_KEYWORD_REGEX.test(folded) ||
    matchedAccessorySkusSet.size > 0 ||
    requestedAccessoryBrandsSet.size > 0;
  const asksProductsBroadly = BROAD_PRODUCT_QUERY_REGEX.test(folded);

  let specFocus = 'GENERAL';
  if (SPEC_SEAT_HEIGHT_REGEX.test(folded)) {
    specFocus = 'SEAT_HEIGHT';
  } else if (SPEC_WEIGHT_REGEX.test(folded)) {
    specFocus = 'WEIGHT';
  } else if (SPEC_PRICE_REGEX.test(folded)) {
    specFocus = 'PRICE';
  } else if (SPEC_STOCK_REGEX.test(folded)) {
    specFocus = 'STOCK';
  } else if (SPEC_TECHNICAL_REGEX.test(folded)) {
    specFocus = 'SPECS';
  } else if (hasAccessoryQuery && requestedBrandsSet.size === 0) {
    specFocus = 'ACCESSORY';
  }

  return {
    requestedBrands: Array.from(requestedBrandsSet),
    unstockedBrands: Array.from(unstockedBrandsSet),
    matchedAccessorySkus: Array.from(matchedAccessorySkusSet),
    requestedAccessoryBrands: Array.from(requestedAccessoryBrandsSet),
    hasAccessoryQuery,
    asksProductsBroadly,
    specFocus,
  };
}

/**
 * Find motorcycle slugs explicitly or partially referenced in the user's message.
 * Prevents numeric-only displacement collisions (e.g. `KTM 350` will not match `Husqvarna FE 350`).
 * @param {string} message
 * @param {Array<{ slug: string, name: string, brand?: { slug?: string, name?: string } }>} [catalogBikes]
 * @param {string[]} [requestedBrands]
 * @returns {string[]}
 */
export function extractMentionedBikeSlugs(message, catalogBikes = [], requestedBrands = []) {
  const foldedMsg = foldVietnameseText(String(message ?? ''));
  const compactMsg = foldedMsg.replace(/[^a-z0-9]+/g, '');
  const requestedBrandSet = new Set(requestedBrands);
  const matchedEntries = [];

  for (const bike of catalogBikes) {
    if (!bike?.slug || !bike?.name) {
      continue;
    }

    const brandSlug = resolveBikeBrandSlug(bike);
    const brandName = foldVietnameseText(bike?.brand?.name ?? brandSlug).trim();
    const foldedName = foldVietnameseText(bike.name);
    const compactName = foldedName.replace(/[^a-z0-9]+/g, '');
    const compactSlug = bike.slug.toLowerCase().replace(/[^a-z0-9]+/g, '');

    if (
      foldedMsg.includes(foldedName) ||
      foldedMsg.includes(bike.slug.toLowerCase()) ||
      (compactName.length >= 6 && compactMsg.includes(compactName)) ||
      (compactSlug.length >= 6 && compactMsg.includes(compactSlug))
    ) {
      matchedEntries.push({ slug: bike.slug, brandSlug, explicit: true });
      continue;
    }

    const tokens = foldedName.split(/\s+/).filter(Boolean);
    const nonBrandTokens = tokens.filter((t) => t !== brandName && t !== brandSlug);

    const alphaNumCodes = nonBrandTokens.filter((t) => /[a-z]/.test(t) && /\d/.test(t));
    const matchesAlphaNumCode = alphaNumCodes.some((tok) => {
      const bareTok = tok.replace(/[^a-z0-9]/g, '');
      return hasWordToken(foldedMsg, tok) || (bareTok.length >= 4 && compactMsg.includes(bareTok));
    });

    if (matchesAlphaNumCode) {
      matchedEntries.push({ slug: bike.slug, brandSlug, explicit: true });
      continue;
    }

    const compactModelOnly = nonBrandTokens.join('').replace(/[^a-z0-9]+/g, '');
    if (compactModelOnly.length >= 5 && compactMsg.includes(compactModelOnly)) {
      matchedEntries.push({ slug: bike.slug, brandSlug, explicit: true });
      continue;
    }

    if (foldedName.includes('tenere') && hasWordToken(foldedMsg, 'tenere')) {
      matchedEntries.push({ slug: bike.slug, brandSlug, explicit: true });
      continue;
    }

    const numericTokens = nonBrandTokens.filter((t) => /^\d{3,4}$/.test(t));
    const alphaModelTokens = nonBrandTokens
      .map((t) => t.replace(/[^a-z]/g, ''))
      .filter((t) => t.length >= 2);
    const hasBikeBrand =
      requestedBrandSet.has(brandSlug) ||
      hasWordToken(foldedMsg, brandSlug) ||
      hasWordToken(foldedMsg, brandName);
    const hasAlphaModelSibling = alphaModelTokens.some((tok) => hasWordToken(foldedMsg, tok));

    if (
      numericTokens.some((numTok) => hasWordToken(foldedMsg, numTok)) &&
      (hasBikeBrand || hasAlphaModelSibling)
    ) {
      matchedEntries.push({ slug: bike.slug, brandSlug, explicit: false });
    }
  }

  const filtered =
    requestedBrandSet.size > 0
      ? matchedEntries.filter((e) => e.explicit || requestedBrandSet.has(e.brandSlug))
      : matchedEntries;

  return Array.from(new Set(filtered.map((e) => e.slug)));
}

const PRIORITY_POLICY_RULES = Object.freeze([
  {
    intent: CHAT_INTENTS.ORDER_STATUS_HELP,
    docSlug: POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT,
    patterns: [
      /\bdf-\d{4,}/i,
      /\b(my order|check order|order status|track order|don hang cua toi|kiem tra don|trang thai don|tra cuu don|ma don hang)\b/i,
    ],
  },
  {
    intent: CHAT_INTENTS.SHOWROOM_TEST_RIDE,
    docSlug: POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT,
    patterns: [
      /\b(showroom|test[- ]?ride|lai thu|dat lich lai|long bien|son tra|thu duc|ha noi|hanoi|da nang|danang|tp\.?\s*hcm|sai gon|bang lai|license a1|a2 license)\b/i,
    ],
  },
  {
    intent: CHAT_INTENTS.POLICY_ORDERING,
    docSlug: POLICY_DOC_SLUGS.ORDERING_AND_DEPOSIT,
    patterns: [
      /\b(deposit|dat coc|coc xe|payos|vietqr|qr code|\bcod\b|cash on delivery|thu ho|giu cho|reservation|15 ?min|15 phut|huy don|cancel order|thanh toan|payment|ordering|checkout)\b/i,
    ],
  },
  {
    intent: CHAT_INTENTS.POLICY_WARRANTY,
    docSlug: POLICY_DOC_SLUGS.WARRANTY_AND_RETURNS,
    patterns: [
      /\b(warranty|bao hanh|returns?|doi tra|hoan tien|refund|\bpdi\b|handover|ban giao|lap dat|workshop)\b/i,
    ],
  },
  {
    intent: CHAT_INTENTS.POLICY_TERMS,
    docSlug: POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS,
    patterns: [
      /\b(terms?|dieu khoan|dieu kien|privacy|quyen rieng tu|du lieu ca nhan|disclaimer|mien tru|liability|trach nhiem|oauth|google account|xoa tai khoan)\b/i,
    ],
  },
]);

const EXPLICIT_FIT_SIGNAL_REGEX =
  /\b(rider ?fit|chong chan|flat[- ]?foot|tip[- ]?toe|balls of feet|di vua|co vua|vua khong|ngoi vua|chong toi|chong duoc|fit me|fits me|tu van chon xe|chon xe nao|xe nao phu hop|phu hop voi|voc dang|simulator|mo phong 2d|\bsag\b|preload)\b/i;

const LOWERING_FIT_TOPIC_REGEX = /\b(ha yen|lowering)\b/i;

const CATALOG_PRICING_REGEX =
  /\b(price|gia ban|gia xe|hoi gia|bao nhieu|cost|stock|ton kho|con hang|available|spec|thong so|engine|phan khoi|cc|dual[- ]?sport|enduro|motocross|adventure|supermoto|catalog|accessories|phu kien|xe nao|compare|so sanh|chieu cao yen|do cao yen|yen cao bao nhieu|seat height|trong luong|nang bao nhieu|wet weight|co xe|co san pham|ben shop ban|shop co|do you have|do you sell|do you carry)\b/i;

const EXPLICIT_POLICY_SIGNAL_REGEX =
  /\b(deposit|dat coc|coc xe|payos|vietqr|\bcod\b|cash on delivery|thu ho|giu cho|reservation|15 ?min|15 phut|huy don|cancel order|thanh toan|payment|warranty|bao hanh|returns?|doi tra|hoan tien|refund|\bpdi\b|handover|ban giao|giao xe|terms?|dieu khoan|dieu kien|privacy|quyen rieng tu|du lieu ca nhan|bao mat|disclaimer|mien tru|oauth|showroom|test[- ]?ride|lai thu)\b/i;

/**
 * Detect whether the customer message explicitly asks about ordering policies, warranty, terms,
 * privacy, or showroom test rides so BM25 policy retrieval stays tightly relevant.
 * @param {string} message
 * @returns {boolean}
 */
export function hasExplicitPolicySignal(message) {
  const folded = foldVietnameseText(String(message ?? ''));
  return EXPLICIT_POLICY_SIGNAL_REGEX.test(folded);
}

const GENERAL_PURCHASE_PATTERNS = Object.freeze([
  /\b(toi muon mua|minh muon mua|muon mua|can mua|tim mua|mua xe|can tu van|tu van giup|tu van cho|tu van xe|chon xe|gioi thieu xe|shop ban gi|co nhung xe|xem xe|dat xe)\b/i,
  /\b(want to buy|looking to buy|buy a (bike|motorcycle)|need advice|help me choose|recommend (a |me )?(bike|motorcycle)|what bikes do you (sell|have)|looking for a (bike|motorcycle)|shopping for)\b/i,
]);

const PURE_GREETING_REGEX =
  /^(alo+|a lo|xin chao|chao|chao shop|chao ad|chao admin|chao ban|hello|hi|hey|hi there|good morning|good afternoon|good evening|shop oi|ad oi|co ai khong|co ai o day khong)(\s+(shop|ad|admin|ban|dirtfit|there|everyone|moi nguoi))?$/i;

function isPureGreetingMessage(foldedMessage) {
  const stripped = String(foldedMessage ?? '')
    .replace(/[!?.~,;:'"()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) {
    return false;
  }

  const tokenCount = stripped.split(' ').length;
  if (tokenCount > 6) {
    return false;
  }

  return PURE_GREETING_REGEX.test(stripped);
}

/**
 * Classify user message into one of DirtFit's structured chatbot intents and extract entities.
 * Pure JS, zero network calls (< 1ms).
 * Priority: clear off-topic guard -> explicit body dimensions -> policy/test-ride/order rules
 * -> explicit rider-fit signals -> catalog/brand/spec/accessory queries -> general purchase
 * -> pure short greeting -> OUT_OF_SCOPE.
 * @param {string} message
 * @param {Array<object>} [catalogBikes]
 * @param {Array<object>} [catalogAccessories]
 * @returns {{
 *   intent: string,
 *   preferredDocSlug: string|null,
 *   hasPolicySignal: boolean,
 *   entities: ReturnType<typeof extractRiderEntities>,
 *   mentionedSlugs: string[],
 *   catalogEntities: ReturnType<typeof extractCatalogEntities>,
 * }}
 */
export function classifyChatIntent(message, catalogBikes = [], catalogAccessories = []) {
  const folded = foldVietnameseText(String(message ?? ''));
  const entities = extractRiderEntities(message);
  const catalogEntities = extractCatalogEntities(message, catalogBikes, catalogAccessories);
  const mentionedSlugs = extractMentionedBikeSlugs(
    message,
    catalogBikes,
    catalogEntities.requestedBrands
  );
  const hasPolicySignal = hasExplicitPolicySignal(message);

  if (CLEAR_OFF_TOPIC_REGEX.test(folded)) {
    return {
      intent: CHAT_INTENTS.OUT_OF_SCOPE,
      preferredDocSlug: null,
      hasPolicySignal: false,
      entities,
      mentionedSlugs: [],
      catalogEntities: {
        requestedBrands: [],
        unstockedBrands: [],
        matchedAccessorySkus: [],
        requestedAccessoryBrands: [],
        hasAccessoryQuery: false,
        asksProductsBroadly: false,
        specFocus: 'GENERAL',
      },
    };
  }

  if (entities.hasExplicitDimensions) {
    return {
      intent: CHAT_INTENTS.RIDER_FIT_ADVICE,
      preferredDocSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
      hasPolicySignal,
      entities,
      mentionedSlugs,
      catalogEntities,
    };
  }

  for (const rule of PRIORITY_POLICY_RULES) {
    if (rule.patterns.some((re) => re.test(folded))) {
      return {
        intent: rule.intent,
        preferredDocSlug: rule.docSlug,
        hasPolicySignal,
        entities,
        mentionedSlugs,
        catalogEntities,
      };
    }
  }

  const isLoweringFitAdvice =
    LOWERING_FIT_TOPIC_REGEX.test(folded) && !ACCESSORY_COMMERCE_SIGNAL_REGEX.test(folded);
  if (EXPLICIT_FIT_SIGNAL_REGEX.test(folded) || isLoweringFitAdvice) {
    return {
      intent: CHAT_INTENTS.RIDER_FIT_ADVICE,
      preferredDocSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
      hasPolicySignal,
      entities,
      mentionedSlugs,
      catalogEntities,
    };
  }

  const hasCatalogEntitySignal =
    mentionedSlugs.length > 0 ||
    catalogEntities.requestedBrands.length > 0 ||
    catalogEntities.unstockedBrands.length > 0 ||
    catalogEntities.hasAccessoryQuery ||
    catalogEntities.matchedAccessorySkus.length > 0 ||
    catalogEntities.requestedAccessoryBrands.length > 0;

  if (CATALOG_PRICING_REGEX.test(folded) || hasCatalogEntitySignal) {
    return {
      intent: CHAT_INTENTS.CATALOG_PRICING,
      preferredDocSlug: null,
      hasPolicySignal,
      entities,
      mentionedSlugs,
      catalogEntities,
    };
  }

  if (GENERAL_PURCHASE_PATTERNS.some((re) => re.test(folded))) {
    return {
      intent: CHAT_INTENTS.GENERAL_PURCHASE,
      preferredDocSlug: null,
      hasPolicySignal,
      entities,
      mentionedSlugs,
      catalogEntities,
    };
  }

  if (isPureGreetingMessage(folded)) {
    return {
      intent: CHAT_INTENTS.GREETING,
      preferredDocSlug: null,
      hasPolicySignal: false,
      entities,
      mentionedSlugs,
      catalogEntities,
    };
  }

  return {
    intent: CHAT_INTENTS.OUT_OF_SCOPE,
    preferredDocSlug: null,
    hasPolicySignal: false,
    entities,
    mentionedSlugs,
    catalogEntities,
  };
}
