import { POLICY_DOC_SLUGS } from '@dirtfit/knowledge/constants';
import { foldVietnameseText } from '@dirtfit/knowledge/retriever';
import { BIKE_CATEGORIES, CHAT_INTENTS, FOOTWEAR_TYPES } from '@dirtfit/shared';

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

/**
 * Find motorcycle slugs explicitly or partially referenced in the user's message.
 * @param {string} message
 * @param {Array<{ slug: string, name: string }>} [catalogBikes]
 * @returns {string[]}
 */
export function extractMentionedBikeSlugs(message, catalogBikes = []) {
  const foldedMsg = foldVietnameseText(String(message ?? ''));
  const compactMsg = foldedMsg.replace(/[^a-z0-9]+/g, '');
  const matched = [];

  for (const bike of catalogBikes) {
    if (!bike?.slug || !bike?.name) {
      continue;
    }

    const foldedName = foldVietnameseText(bike.name);
    const compactName = foldedName.replace(/[^a-z0-9]+/g, '');
    const compactSlug = bike.slug.toLowerCase().replace(/[^a-z0-9]+/g, '');

    if (
      foldedMsg.includes(foldedName) ||
      foldedMsg.includes(bike.slug.toLowerCase()) ||
      (compactName.length >= 6 && compactMsg.includes(compactName)) ||
      (compactSlug.length >= 6 && compactMsg.includes(compactSlug))
    ) {
      matched.push(bike.slug);
      continue;
    }

    // Match distinct model code tokens such as crf300l, crf250r, klx230, wr155r, dr-z400s, exc-f, tenere 700, 390 adventure
    const nameTokens = foldedName.split(/\s+/).filter((t) => /\d/.test(t) && t.length >= 3);
    const matchesModelCode = nameTokens.some((tok) => {
      const bareTok = tok.replace(/[^a-z0-9]/g, '');
      return foldedMsg.includes(tok) || (bareTok.length >= 4 && compactMsg.includes(bareTok));
    });

    if (matchesModelCode || (foldedName.includes('tenere') && foldedMsg.includes('tenere'))) {
      matched.push(bike.slug);
    }
  }

  return Array.from(new Set(matched));
}

const KEYWORD_RULES = Object.freeze([
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
  {
    intent: CHAT_INTENTS.RIDER_FIT_ADVICE,
    docSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
    patterns: [
      /\b(rider ?fit|chong chan|flat[- ]?foot|tip[- ]?toe|balls of feet|ha yen|lowering|low seat|lowering link|seat height|chieu cao yen|\bsag\b|preload|fit me|fits me|tu van chon xe|chon xe nao|xe nao phu hop|phu hop voi|voc dang|simulator|mo phong 2d|giay mx|mx boots)\b/i,
    ],
  },
  {
    intent: CHAT_INTENTS.CATALOG_PRICING,
    docSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
    patterns: [
      /\b(price|gia ban|gia xe|bao nhieu|cost|stock|ton kho|con hang|available|spec|thong so|engine|phan khoi|cc|dual[- ]?sport|enduro|motocross|adventure|supermoto|catalog|accessories|phu kien|xe nao)\b/i,
    ],
  },
]);

/**
 * Classify user message into one of 8 structured DirtFit chatbot intents and extract entities.
 * Pure JS, zero network calls (< 1ms).
 * @param {string} message
 * @param {Array<{ slug: string, name: string }>} [catalogBikes]
 * @returns {{
 *   intent: string,
 *   preferredDocSlug: string|null,
 *   entities: ReturnType<typeof extractRiderEntities>,
 *   mentionedSlugs: string[],
 * }}
 */
export function classifyChatIntent(message, catalogBikes = []) {
  const folded = foldVietnameseText(String(message ?? ''));
  const entities = extractRiderEntities(message);
  const mentionedSlugs = extractMentionedBikeSlugs(message, catalogBikes);

  if (entities.hasExplicitDimensions) {
    return {
      intent: CHAT_INTENTS.RIDER_FIT_ADVICE,
      preferredDocSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
      entities,
      mentionedSlugs,
    };
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((re) => re.test(folded))) {
      return {
        intent: rule.intent,
        preferredDocSlug: rule.docSlug,
        entities,
        mentionedSlugs,
      };
    }
  }

  if (mentionedSlugs.length > 0) {
    return {
      intent: CHAT_INTENTS.CATALOG_PRICING,
      preferredDocSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
      entities,
      mentionedSlugs,
    };
  }

  return {
    intent: CHAT_INTENTS.OUT_OF_SCOPE,
    preferredDocSlug: null,
    entities,
    mentionedSlugs,
  };
}
