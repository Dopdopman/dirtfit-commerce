import { evaluateBikeFit } from '@dirtfit/ergonomics-engine';
import { getPolicyDocument, searchKnowledge } from '@dirtfit/knowledge';
import { POLICY_DOC_SLUGS } from '@dirtfit/knowledge/constants';
import { foldVietnameseText } from '@dirtfit/knowledge/retriever';
import { CHAT_INTENTS, SHOWROOMS, resolveBikeMedia, toSafeVndNumber } from '@dirtfit/shared';
import { CATALOG_KEYS, getOrSetCatalogCache } from '../../common/cache/catalog-cache.js';
import {
  computeAvailableQty,
  getActiveReservedQtyByBikeIds,
} from '../../common/inventory/availability.js';
import { findPublicAccessories } from '../accessories/accessories.repository.js';
import { findActiveBikesProjection, findBikeStockMapByIds } from '../catalog/catalog.repository.js';
import {
  formatAccessoryCategoryLabel,
  formatCategoryLabel,
  formatContactLabel,
  formatFootwearLabel,
} from './human-labels.js';
import { classifyChatIntent, extractRiderEntities } from './intent-router.js';
import { extractGroundedAccessories } from './link-grounder.js';
import { getChatbotPrompts, renderGroundedPrompt } from './prompts/prompt-loader.js';

const DEFAULT_FALLBACK_RIDER = Object.freeze({
  heightCm: 170,
  weightKg: 68,
  inseamCm: null,
  footwear: 'ADV_BOOTS',
  bodyProportion: 'AVERAGE',
  ridingExperience: 'INTERMEDIATE',
  targetTerrain: 'DUAL_SPORT',
  stanceMode: 'SEATED_BOTH_FEET',
});

/**
 * Format integer VND safely for grounded LLM prompts.
 * @param {number} amount
 * @returns {string}
 */
export function formatPromptVnd(amount) {
  return `${new Intl.NumberFormat('en-US').format(Math.round(Number(amount ?? 0)))} VND`;
}

/**
 * Build a safe internal DirtFit Simulator URL preloaded with rider metrics.
 * @param {string} slug
 * @param {{ heightCm?: number|null, weightKg?: number|null, inseamCm?: number|null }|null} rider
 * @returns {string}
 */
export function buildSimulatorUrl(slug, rider) {
  const params = new URLSearchParams();
  if (rider?.heightCm) {
    params.set('heightCm', String(Math.round(rider.heightCm)));
  }
  if (rider?.weightKg) {
    params.set('weightKg', String(Math.round(rider.weightKg)));
  }
  if (rider?.inseamCm) {
    params.set('inseamCm', String(Math.round(rider.inseamCm)));
  }
  const qs = params.toString();
  return qs ? `/bikes/${slug}?${qs}` : `/bikes/${slug}`;
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

function collectStockedBrandNames(liveBikes = []) {
  const bySlug = new Map();
  for (const bike of liveBikes) {
    const slug = resolveBikeBrandSlug(bike);
    const label = bike?.brand?.name ?? (slug ? slug.toUpperCase() : null);
    if (slug && label && !bySlug.has(slug)) {
      bySlug.set(slug, label);
    }
  }
  return Array.from(bySlug.values());
}

function mergeGroundedAccessories(liveBikes = [], liveAccessories = []) {
  const bySku = new Map();
  for (const acc of extractGroundedAccessories(liveBikes)) {
    bySku.set(acc.sku.toUpperCase(), acc);
  }
  for (const acc of liveAccessories) {
    if (!acc?.sku || !acc?.name) {
      continue;
    }
    const key = String(acc.sku).trim().toUpperCase();
    if (!bySku.has(key)) {
      bySku.set(key, {
        id: acc.id ?? null,
        sku: String(acc.sku).trim(),
        name: String(acc.name).trim(),
      });
    }
  }
  return Array.from(bySku.values());
}

/**
 * Scan recent USER turns in reverse chronological order for previously stated rider dimensions.
 * Only ever used when the current turn is classified as `RIDER_FIT_ADVICE` or to offer a helpful hint.
 * @param {Array<{ role: string, content: string }>} [history]
 * @returns {ReturnType<typeof extractRiderEntities>|null}
 */
export function extractLatestRiderProfileFromHistory(history = []) {
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn?.role !== 'USER' || typeof turn?.content !== 'string') {
      continue;
    }
    const extracted = extractRiderEntities(turn.content);
    if (extracted.hasExplicitDimensions) {
      return extracted;
    }
  }

  return null;
}

/**
 * Evaluate live motorcycles with DirtFit ergonomics physics for a given rider profile.
 * Pure deterministic function suitable for direct unit testing without DB/Redis.
 * Supports strict `brandSlugs` and `mentionedSlugs` scoping so brand-specific queries return only matching bikes.
 * @param {object} params
 * @param {Array<object>} params.bikes
 * @param {object} params.riderProfile
 * @param {'en'|'vi'} [params.locale]
 * @param {string|null} [params.category]
 * @param {string[]} [params.brandSlugs]
 * @param {string[]} [params.mentionedSlugs]
 * @param {number} [params.maxResults]
 * @returns {Array<object>}
 */
export function evaluateCatalogForRider({
  bikes,
  riderProfile,
  locale = 'en',
  category = null,
  brandSlugs = [],
  mentionedSlugs = [],
  maxResults = 3,
}) {
  const safeLocale = locale === 'vi' ? 'vi' : 'en';
  const normalizedRider = {
    ...DEFAULT_FALLBACK_RIDER,
    ...riderProfile,
  };

  let filtered = Array.isArray(bikes) ? bikes.filter((b) => Boolean(b?.geometrySpec)) : [];

  if (Array.isArray(mentionedSlugs) && mentionedSlugs.length > 0) {
    const mentionedSet = new Set(mentionedSlugs);
    const byModel = filtered.filter((b) => mentionedSet.has(b.slug));
    if (byModel.length > 0) {
      filtered = byModel;
    }
  } else if (Array.isArray(brandSlugs) && brandSlugs.length > 0) {
    const brandSet = new Set(brandSlugs.map((s) => String(s).toLowerCase()));
    const byBrand = filtered.filter((b) => brandSet.has(resolveBikeBrandSlug(b)));
    if (byBrand.length > 0) {
      filtered = byBrand;
    }
  }

  if (category) {
    const byCategory = filtered.filter((b) => b.category === category);
    if (byCategory.length > 0) {
      filtered = byCategory;
    }
  }

  const mentionedSet = new Set(mentionedSlugs);
  const scored = filtered.map((bike) => {
    const compatibleErgo = (bike.compatibilities ?? [])
      .filter(
        (c) =>
          c.accessory &&
          c.accessory.status === 'ACTIVE' &&
          (c.availableQty ?? c.accessory.stockQty ?? 0) > 0
      )
      .map((c) => {
        const baseImpact = c.accessory.ergoImpactJson ?? {};
        return {
          id: c.accessory.id,
          sku: c.accessory.sku ?? null,
          name: c.accessory.name,
          category: c.accessory.category,
          priceVnd: c.accessory.priceVnd,
          installLaborVnd: c.installLaborVnd ?? 0,
          ergoImpact: {
            ...baseImpact,
            ...(c.exactSeatDropMm !== null && c.accessory.category === 'LOW_SEAT'
              ? { lowSeatMm: c.exactSeatDropMm }
              : {}),
            ...(c.exactSeatDropMm !== null && c.accessory.category === 'LOWERING_LINK'
              ? { loweringLinkMm: c.exactSeatDropMm }
              : {}),
            ...(c.exactForkDropMm !== null ? { forkDropMm: c.exactForkDropMm } : {}),
          },
        };
      });

    const evalResult = evaluateBikeFit(normalizedRider, bike.geometrySpec, {}, compatibleErgo);
    const bestUpsell = evalResult.upsellSuggestions?.[0] ?? null;
    const primaryUpsellAcc = bestUpsell?.accessoryIds?.[0]
      ? compatibleErgo.find((item) => item.id === bestUpsell.accessoryIds[0])
      : null;
    const recommendedLoweringMm = bestUpsell
      ? Math.max(0, Math.round(bestUpsell.beforeSeatHeightMm - bestUpsell.afterSeatHeightMm))
      : 0;
    const resolvedMedia = resolveBikeMedia(bike.media);

    return {
      _mentionBoost: mentionedSet.has(bike.slug) ? 1 : 0,
      cardMode: 'FIT',
      id: bike.id,
      slug: bike.slug,
      name: bike.name,
      brand: bike.brand?.name ?? null,
      brandName: bike.brand?.name ?? null,
      category: bike.category,
      engineCc: bike.engineCc ?? null,
      coverImageUrl: bike.coverImageUrl ?? resolvedMedia.coverImageUrl,
      commercialImageUrl: bike.commercialImageUrl ?? resolvedMedia.commercialImageUrl,
      coverImageKind: bike.coverImageKind ?? resolvedMedia.commercialImageKind,
      seatHeightMm: bike.geometrySpec.unladenSeatHeightMm,
      unladenSeatHeightMm: bike.geometrySpec.unladenSeatHeightMm,
      effectiveSeatHeightMm: evalResult.sag.effectiveSeatHeightMm,
      riderSagMm: evalResult.sag.totalRearSagMm,
      contactStatus: evalResult.footContact.contactStatus,
      fitScore: evalResult.fitScore,
      priceVnd: toSafeVndNumber(bike.priceVnd, 'priceVnd'),
      depositAmountVnd: toSafeVndNumber(bike.depositAmountVnd, 'depositAmountVnd'),
      availableQty: Number(bike.availableQty ?? bike.stockQty ?? 0),
      recommendedLoweringMm,
      loweringAccessorySku: primaryUpsellAcc?.sku ?? null,
      loweringAccessoryName: primaryUpsellAcc?.name ?? null,
      loweringTip: bestUpsell
        ? `${bestUpsell.title} (${bestUpsell.afterSeatHeightMm}mm · ${formatContactLabel(bestUpsell.afterContactStatus, safeLocale)})`
        : null,
      productUrl: `/bikes/${bike.slug}`,
      simulatorUrl: buildSimulatorUrl(bike.slug, normalizedRider),
    };
  });

  scored.sort((a, b) => {
    if (b._mentionBoost !== a._mentionBoost) {
      return b._mentionBoost - a._mentionBoost;
    }
    if (b.fitScore !== a.fitScore) {
      return b.fitScore - a.fitScore;
    }
    return a.effectiveSeatHeightMm - b.effectiveSeatHeightMm;
  });

  return scored.slice(0, maxResults).map((entry) => {
    const clean = { ...entry };
    delete clean._mentionBoost;
    return clean;
  });
}

/**
 * Retrieve active bikes from L1/L2 CatalogCache and overlay real-time Lazy Expiration availability.
 * @param {import('fastify').FastifyInstance} app
 * @returns {Promise<Array<object>>}
 */
async function loadLiveCatalogBikes(app) {
  const cachedBikes = await getOrSetCatalogCache(
    app,
    CATALOG_KEYS.BIKE_FIT_PROJECTIONS,
    () => findActiveBikesProjection(app.prisma),
    { l2TtlSec: 120 }
  );

  const bikeIds = cachedBikes.map((b) => b.id);
  const [stockMap, reservedMap] = await Promise.all([
    findBikeStockMapByIds(app.prisma, bikeIds),
    getActiveReservedQtyByBikeIds(app.prisma, bikeIds),
  ]);

  return cachedBikes.map((bike) => {
    const liveStockQty = stockMap.get(bike.id) ?? bike.stockQty;
    const reservedQty = reservedMap.get(bike.id) ?? 0;
    return {
      ...bike,
      stockQty: liveStockQty,
      availableQty: computeAvailableQty(liveStockQty, reservedQty),
    };
  });
}

async function loadLiveAccessories(app) {
  const raw = await getOrSetCatalogCache(
    app,
    CATALOG_KEYS.PUBLIC_ACCESSORIES,
    () => findPublicAccessories(app.prisma, {}),
    { l2TtlSec: 120 }
  );
  return Array.isArray(raw) ? raw : [];
}

/**
 * Build structured compact catalog recommendation cards for purchase, pricing, and comparison intents.
 * @param {Array<object>} bikes
 * @param {number} [maxResults]
 * @returns {Array<object>}
 */
export function buildCatalogRecommendationCards(bikes, maxResults = 4) {
  if (!Array.isArray(bikes) || bikes.length === 0) {
    return [];
  }

  return bikes
    .filter((b) => Boolean(b?.slug && b?.name))
    .slice(0, maxResults)
    .map((bike) => {
      const resolvedMedia = resolveBikeMedia(bike.media);
      const seatMm = bike.geometrySpec?.unladenSeatHeightMm ?? null;
      return {
        cardMode: 'CATALOG',
        id: bike.id,
        slug: bike.slug,
        name: bike.name,
        brand: bike.brand?.name ?? null,
        brandName: bike.brand?.name ?? null,
        category: bike.category,
        engineCc: bike.engineCc ?? null,
        seatHeightMm: seatMm,
        unladenSeatHeightMm: seatMm,
        priceVnd: toSafeVndNumber(bike.priceVnd, 'priceVnd'),
        depositAmountVnd: toSafeVndNumber(bike.depositAmountVnd, 'depositAmountVnd'),
        availableQty: Number(bike.availableQty ?? bike.stockQty ?? 0),
        coverImageUrl: bike.coverImageUrl ?? resolvedMedia.coverImageUrl,
        commercialImageUrl: bike.commercialImageUrl ?? resolvedMedia.commercialImageUrl,
        coverImageKind: bike.coverImageKind ?? resolvedMedia.commercialImageKind,
        productUrl: `/bikes/${bike.slug}`,
      };
    });
}

function selectRepresentativeBikes(liveBikes, maxCount = 4) {
  if (!Array.isArray(liveBikes) || liveBikes.length === 0) {
    return [];
  }
  const picked = [];
  const seenCategories = new Set();
  for (const bike of liveBikes) {
    if (!seenCategories.has(bike.category)) {
      seenCategories.add(bike.category);
      picked.push(bike);
      if (picked.length >= maxCount) {
        return picked;
      }
    }
  }
  for (const bike of liveBikes) {
    if (!picked.some((p) => p.id === bike.id)) {
      picked.push(bike);
      if (picked.length >= maxCount) {
        break;
      }
    }
  }
  return picked;
}

function mapCompatibleAccessoriesForBikes(matchedBikes, liveAccessoriesBySku) {
  const bySku = new Map();
  for (const bike of matchedBikes) {
    for (const comp of bike?.compatibilities ?? []) {
      const acc = comp?.accessory;
      if (!acc?.sku || !acc?.name || acc.status !== 'ACTIVE') {
        continue;
      }
      const key = String(acc.sku).trim().toUpperCase();
      if (bySku.has(key)) {
        continue;
      }
      const fullAcc = liveAccessoriesBySku.get(key);
      const stockQty = fullAcc?.stockQty ?? acc.stockQty ?? 0;
      const reservedQty = fullAcc?.reservedQty ?? acc.reservedQty ?? 0;
      bySku.set(key, {
        id: acc.id,
        sku: acc.sku,
        name: acc.name,
        category: acc.category,
        brandName: fullAcc?.brandName ?? acc.brandName ?? null,
        priceVnd: toSafeVndNumber(fullAcc?.priceVnd ?? acc.priceVnd, 'priceVnd'),
        availableQty: computeAvailableQty(stockQty, reservedQty),
        productUrl: `/accessories?sku=${encodeURIComponent(acc.sku)}`,
      });
    }
  }
  return Array.from(bySku.values());
}

function filterMatchedAccessories({ message, liveAccessories, matchedBikes, catalogEntities }) {
  const liveBySku = new Map();
  for (const acc of liveAccessories) {
    if (acc?.sku) {
      liveBySku.set(String(acc.sku).trim().toUpperCase(), acc);
    }
  }

  const picked = new Map();
  const addAcc = (acc) => {
    if (!acc?.sku || picked.has(acc.sku.toUpperCase())) {
      return;
    }
    const stockQty = acc.stockQty ?? 0;
    const reservedQty = acc.reservedQty ?? 0;
    picked.set(acc.sku.toUpperCase(), {
      id: acc.id,
      sku: acc.sku,
      name: acc.name,
      category: acc.category,
      brandName: acc.brandName ?? null,
      priceVnd: toSafeVndNumber(acc.priceVnd, 'priceVnd'),
      availableQty: acc.availableQty ?? computeAvailableQty(stockQty, reservedQty),
      productUrl: `/accessories?sku=${encodeURIComponent(acc.sku)}`,
    });
  };

  for (const sku of catalogEntities.matchedAccessorySkus ?? []) {
    const hit = liveBySku.get(String(sku).trim().toUpperCase());
    if (hit) {
      addAcc(hit);
    }
  }

  const folded = foldVietnameseText(String(message ?? ''));
  const wantedCategories = new Set();
  if (/\b(link ha phuoc|lowering link|lowering kit)\b/i.test(folded)) {
    wantedCategories.add('LOWERING_LINK');
  }
  if (/\b(yen thap|low seat)\b/i.test(folded)) {
    wantedCategories.add('LOW_SEAT');
  }
  if (/\b(giay|ung|boots?|do bao ho)\b/i.test(folded)) {
    wantedCategories.add('APPAREL');
  }
  if (/\b(nang ghi dong|bar riser)\b/i.test(folded)) {
    wantedCategories.add('BAR_RISER');
  }
  if (/\b(lo xo|shock spring)\b/i.test(folded)) {
    wantedCategories.add('SHOCK_SPRING');
  }

  if (wantedCategories.size > 0) {
    for (const acc of liveAccessories) {
      if (wantedCategories.has(acc.category)) {
        addAcc(acc);
      }
    }
  }

  if (
    matchedBikes.length > 0 &&
    (catalogEntities.asksProductsBroadly || catalogEntities.hasAccessoryQuery)
  ) {
    for (const acc of mapCompatibleAccessoriesForBikes(matchedBikes, liveBySku)) {
      addAcc(acc);
    }
  }

  if (picked.size === 0 && catalogEntities.hasAccessoryQuery && matchedBikes.length === 0) {
    for (const acc of liveAccessories.slice(0, 4)) {
      addAcc(acc);
    }
  }

  return Array.from(picked.values()).slice(0, 4);
}

/**
 * Resolve relevant knowledge base chunks and grounded policy citations without pulling noisy sections.
 * @param {string} message
 * @param {'en'|'vi'} locale
 * @param {string} intent
 * @param {string|null} preferredDocSlug
 * @param {boolean} hasPolicySignal
 * @returns {Array<object>}
 */
function retrieveGroundedPolicyChunks(message, locale, intent, preferredDocSlug, hasPolicySignal) {
  if (intent === CHAT_INTENTS.OUT_OF_SCOPE || intent === CHAT_INTENTS.GREETING) {
    return [];
  }

  if (intent === CHAT_INTENTS.GENERAL_PURCHASE || intent === CHAT_INTENTS.CATALOG_PRICING) {
    if (!hasPolicySignal) {
      return [];
    }
    return searchKnowledge(message, {
      locale,
      topK: 2,
      minScore: 0.35,
    });
  }

  if (intent === CHAT_INTENTS.RIDER_FIT_ADVICE) {
    const chunks = searchKnowledge(message, {
      locale,
      topK: 4,
      minScore: 0.15,
      preferredDocSlug: POLICY_DOC_SLUGS.RIDER_FIT_FAQ,
    });
    if (!hasPolicySignal) {
      return chunks.filter((c) => c.docSlug === POLICY_DOC_SLUGS.RIDER_FIT_FAQ).slice(0, 3);
    }
    return chunks.slice(0, 3);
  }

  let chunks = searchKnowledge(message, {
    locale,
    topK: 4,
    minScore: 0.15,
    preferredDocSlug: preferredDocSlug ?? undefined,
  });

  if (chunks.length === 0 && preferredDocSlug) {
    const doc = getPolicyDocument(preferredDocSlug, locale);
    chunks = (doc.sections ?? []).slice(0, 3);
  } else if (
    (intent === CHAT_INTENTS.POLICY_ORDERING ||
      intent === CHAT_INTENTS.POLICY_TERMS ||
      intent === CHAT_INTENTS.POLICY_WARRANTY) &&
    preferredDocSlug &&
    !chunks.some((c) => c.docSlug === preferredDocSlug)
  ) {
    const doc = getPolicyDocument(preferredDocSlug, locale);
    const primarySections = (doc.sections ?? []).slice(0, 2);
    chunks = [...primarySections, ...chunks].slice(0, 4);
  }

  return chunks;
}

/**
 * Build deduplicated structured citations using humanized labels (no raw SNAKE_CASE enums).
 * @param {Array<object>} chunks
 * @param {Array<object>} recommendedBikes
 * @param {Array<object>} catalogMatches
 * @param {Array<object>} matchedAccessories
 * @param {string} intent
 * @param {'en'|'vi'} locale
 * @returns {Array<{ id: string, title: string, section: string, url: string }>}
 */
function buildStructuredCitations(
  chunks,
  recommendedBikes,
  catalogMatches,
  matchedAccessories,
  intent,
  locale
) {
  const seenUrls = new Set();
  const citations = [];

  for (const chunk of chunks) {
    if (!chunk?.url || seenUrls.has(chunk.url)) {
      continue;
    }
    seenUrls.add(chunk.url);
    citations.push({
      id: chunk.sectionId,
      title: chunk.title,
      section: chunk.heading,
      url: chunk.url,
    });
  }

  if (intent === CHAT_INTENTS.SHOWROOM_TEST_RIDE && !seenUrls.has('/test-ride')) {
    seenUrls.add('/test-ride');
    citations.push({
      id: 'showroom-booking',
      title: locale === 'vi' ? 'Đặt lịch Lái thử Showroom' : 'Showroom Test Ride Booking',
      section: locale === 'vi' ? 'Hà Nội · Đà Nẵng · TP.HCM' : 'Hanoi · Da Nang · HCMC',
      url: '/test-ride',
    });
  }

  if (
    intent === CHAT_INTENTS.RIDER_FIT_ADVICE &&
    !seenUrls.has('/policies/terms#ergonomics-disclaimer')
  ) {
    const termsDoc = getPolicyDocument(POLICY_DOC_SLUGS.TERMS_AND_CONDITIONS, locale);
    const ergoSection = termsDoc.sections.find((s) => s.sectionId === 'ergonomics-disclaimer');
    if (ergoSection && !seenUrls.has(ergoSection.url)) {
      seenUrls.add(ergoSection.url);
      citations.push({
        id: ergoSection.sectionId,
        title: ergoSection.title,
        section: ergoSection.heading,
        url: ergoSection.url,
      });
    }
  }

  for (const bike of [...recommendedBikes, ...catalogMatches].slice(0, 3)) {
    const cleanUrl = `/bikes/${bike.slug}`;
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      citations.push({
        id: `bike:${bike.slug}`,
        title: bike.name,
        section: `${formatPromptVnd(bike.priceVnd)} · ${formatCategoryLabel(bike.category, locale)}`,
        url: cleanUrl,
      });
    }
  }

  for (const acc of matchedAccessories.slice(0, 2)) {
    const cleanUrl = acc.productUrl || `/accessories?sku=${encodeURIComponent(acc.sku)}`;
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      citations.push({
        id: `acc:${acc.sku}`,
        title: acc.name,
        section: `${formatPromptVnd(acc.priceVnd)} · ${formatAccessoryCategoryLabel(acc.category, locale)}`,
        url: cleanUrl,
      });
    }
  }

  if (catalogMatches.length >= 2) {
    const compareUrl = `/compare?bikeA=${encodeURIComponent(catalogMatches[0].slug)}&bikeB=${encodeURIComponent(catalogMatches[1].slug)}`;
    if (!seenUrls.has(compareUrl)) {
      seenUrls.add(compareUrl);
      citations.push({
        id: 'compare-2d',
        title: locale === 'vi' ? 'So sánh 2D Ghost Overlay' : '2D Ghost Overlay Compare',
        section: `${catalogMatches[0].name} vs ${catalogMatches[1].name}`,
        url: compareUrl,
      });
    }
  }

  return citations.slice(0, 6);
}

/**
 * Execute the full DirtFit Zero-Hallucination Grounding Pipeline before invoking any LLM adapter.
 * @param {object} params
 * @param {import('fastify').FastifyInstance} params.app
 * @param {string} params.message
 * @param {'en'|'vi'} [params.locale]
 * @param {Array<{ role: string, content: string }>} [params.history]
 * @param {string|null} [params.userId]
 * @param {object|null} [params.riderProfileInput]
 * @returns {Promise<object>}
 */
export async function buildGroundedChatContext({
  app,
  message,
  locale = 'en',
  history = [],
  userId = null,
  riderProfileInput = null,
}) {
  const safeLocale = locale === 'vi' ? 'vi' : 'en';
  const [liveBikes, liveAccessories] = await Promise.all([
    loadLiveCatalogBikes(app),
    loadLiveAccessories(app),
  ]);
  const stockedBrandNames = collectStockedBrandNames(liveBikes);
  const groundedAccessories = mergeGroundedAccessories(liveBikes, liveAccessories);

  const classification = classifyChatIntent(message, liveBikes, liveAccessories);
  const { intent, preferredDocSlug, hasPolicySignal, entities, mentionedSlugs, catalogEntities } =
    classification;

  const retrievedChunks = retrieveGroundedPolicyChunks(
    message,
    safeLocale,
    intent,
    preferredDocSlug,
    hasPolicySignal
  );

  const historyRiderProfile = extractLatestRiderProfileFromHistory(history);

  // Strict session rider profile hygiene: ONLY compute Rider Fit when intent is RIDER_FIT_ADVICE or new body dimensions are given.
  let effectiveRiderProfile = null;
  if (entities.hasExplicitDimensions) {
    let savedDefault = null;
    if (userId && (entities.heightCm === null || entities.weightKg === null)) {
      savedDefault = await app.prisma.userBodyProfile.findFirst({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
    }
    effectiveRiderProfile = {
      heightCm:
        entities.heightCm ??
        riderProfileInput?.heightCm ??
        savedDefault?.heightCm ??
        DEFAULT_FALLBACK_RIDER.heightCm,
      weightKg:
        entities.weightKg ??
        riderProfileInput?.weightKg ??
        savedDefault?.weightKg ??
        DEFAULT_FALLBACK_RIDER.weightKg,
      inseamCm: entities.inseamCm ?? riderProfileInput?.inseamCm ?? savedDefault?.inseamCm ?? null,
      footwear:
        entities.footwear ??
        riderProfileInput?.footwear ??
        savedDefault?.footwear ??
        DEFAULT_FALLBACK_RIDER.footwear,
      bodyProportion: savedDefault?.bodyProportion ?? DEFAULT_FALLBACK_RIDER.bodyProportion,
      ridingExperience: savedDefault?.ridingExperience ?? DEFAULT_FALLBACK_RIDER.ridingExperience,
      targetTerrain: DEFAULT_FALLBACK_RIDER.targetTerrain,
      stanceMode: DEFAULT_FALLBACK_RIDER.stanceMode,
    };
  } else if (intent === CHAT_INTENTS.RIDER_FIT_ADVICE) {
    if (historyRiderProfile) {
      effectiveRiderProfile = {
        ...DEFAULT_FALLBACK_RIDER,
        ...(riderProfileInput ?? {}),
        heightCm:
          historyRiderProfile.heightCm ??
          riderProfileInput?.heightCm ??
          DEFAULT_FALLBACK_RIDER.heightCm,
        weightKg:
          historyRiderProfile.weightKg ??
          riderProfileInput?.weightKg ??
          DEFAULT_FALLBACK_RIDER.weightKg,
        inseamCm: historyRiderProfile.inseamCm ?? riderProfileInput?.inseamCm ?? null,
        footwear:
          historyRiderProfile.footwear ??
          riderProfileInput?.footwear ??
          DEFAULT_FALLBACK_RIDER.footwear,
      };
    } else if (riderProfileInput) {
      effectiveRiderProfile = {
        ...DEFAULT_FALLBACK_RIDER,
        ...riderProfileInput,
      };
    } else if (userId) {
      const savedDefault = await app.prisma.userBodyProfile.findFirst({
        where: { userId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
      if (savedDefault) {
        effectiveRiderProfile = {
          heightCm: savedDefault.heightCm,
          weightKg: savedDefault.weightKg,
          inseamCm: savedDefault.inseamCm ?? null,
          footwear: savedDefault.footwear ?? DEFAULT_FALLBACK_RIDER.footwear,
          bodyProportion: savedDefault.bodyProportion ?? DEFAULT_FALLBACK_RIDER.bodyProportion,
          ridingExperience:
            savedDefault.ridingExperience ?? DEFAULT_FALLBACK_RIDER.ridingExperience,
          targetTerrain: savedDefault.targetTerrain ?? DEFAULT_FALLBACK_RIDER.targetTerrain,
          stanceMode: DEFAULT_FALLBACK_RIDER.stanceMode,
        };
      } else {
        effectiveRiderProfile = { ...DEFAULT_FALLBACK_RIDER };
      }
    } else {
      effectiveRiderProfile = { ...DEFAULT_FALLBACK_RIDER };
    }
  }

  let catalogScopeStatus = 'NONE';
  let matchedCatalogBikes = [];
  let matchedAccessories = [];

  if (intent !== CHAT_INTENTS.GREETING && intent !== CHAT_INTENTS.OUT_OF_SCOPE) {
    const requestedBrandSet = new Set(
      (catalogEntities.requestedBrands ?? []).map((b) => String(b).toLowerCase())
    );
    const mentionedSet = new Set(mentionedSlugs);

    if (
      catalogEntities.unstockedBrands.length > 0 &&
      requestedBrandSet.size === 0 &&
      mentionedSet.size === 0
    ) {
      catalogScopeStatus = 'UNSTOCKED_BRAND';
      matchedCatalogBikes = [];
      matchedAccessories = [];
    } else if (mentionedSet.size > 0) {
      catalogScopeStatus = 'SCOPED_MODELS';
      matchedCatalogBikes = liveBikes.filter((b) => mentionedSet.has(b.slug));
      matchedAccessories = filterMatchedAccessories({
        message,
        liveAccessories,
        matchedBikes: matchedCatalogBikes,
        catalogEntities,
      });
    } else if (requestedBrandSet.size > 0) {
      catalogScopeStatus = 'SCOPED_BRAND';
      matchedCatalogBikes = liveBikes.filter((b) => requestedBrandSet.has(resolveBikeBrandSlug(b)));
      matchedAccessories = filterMatchedAccessories({
        message,
        liveAccessories,
        matchedBikes: matchedCatalogBikes,
        catalogEntities,
      });
    } else if (
      (catalogEntities.hasAccessoryQuery ||
        catalogEntities.matchedAccessorySkus.length > 0 ||
        catalogEntities.requestedAccessoryBrands.length > 0) &&
      !entities.category
    ) {
      catalogScopeStatus = 'SCOPED_ACCESSORY';
      matchedCatalogBikes = [];
      matchedAccessories = filterMatchedAccessories({
        message,
        liveAccessories,
        matchedBikes: [],
        catalogEntities,
      });
    } else if (entities.category) {
      catalogScopeStatus = 'SCOPED_CATEGORY';
      matchedCatalogBikes = liveBikes.filter((b) => b.category === entities.category).slice(0, 4);
    } else if (
      intent === CHAT_INTENTS.CATALOG_PRICING ||
      intent === CHAT_INTENTS.GENERAL_PURCHASE
    ) {
      catalogScopeStatus = 'REPRESENTATIVE';
      matchedCatalogBikes = selectRepresentativeBikes(liveBikes, 4);
    }
  }

  let recommendedBikes = [];
  if (
    catalogScopeStatus === 'UNSTOCKED_BRAND' ||
    catalogScopeStatus === 'SCOPED_ACCESSORY' ||
    intent === CHAT_INTENTS.GREETING ||
    intent === CHAT_INTENTS.OUT_OF_SCOPE
  ) {
    recommendedBikes = [];
  } else if (effectiveRiderProfile) {
    recommendedBikes = evaluateCatalogForRider({
      bikes: liveBikes,
      riderProfile: effectiveRiderProfile,
      locale: safeLocale,
      category: entities.category,
      brandSlugs: catalogEntities.requestedBrands,
      mentionedSlugs,
      maxResults: 3,
    });
  } else if (
    intent === CHAT_INTENTS.GENERAL_PURCHASE ||
    intent === CHAT_INTENTS.CATALOG_PRICING ||
    mentionedSlugs.length > 0 ||
    catalogEntities.requestedBrands.length > 0
  ) {
    recommendedBikes = buildCatalogRecommendationCards(
      matchedCatalogBikes.length > 0
        ? matchedCatalogBikes
        : selectRepresentativeBikes(liveBikes, 4),
      4
    );
  }

  // Scoped recent orders for ORDER_STATUS_HELP (strictly anti-IDOR, zero PII sent to LLM)
  let scopedOrders = [];
  if (intent === CHAT_INTENTS.ORDER_STATUS_HELP && userId) {
    const rows = await app.prisma.order.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        orderNumber: true,
        orderType: true,
        status: true,
        totalVnd: true,
        payableNowVnd: true,
        remainingBalanceVnd: true,
        createdAt: true,
      },
    });
    scopedOrders = rows.map((row) => ({
      orderNumber: row.orderNumber,
      orderType: row.orderType,
      status: row.status,
      totalVnd: toSafeVndNumber(row.totalVnd, 'totalVnd'),
      payableNowVnd: toSafeVndNumber(row.payableNowVnd, 'payableNowVnd'),
      remainingBalanceVnd: toSafeVndNumber(row.remainingBalanceVnd, 'remainingBalanceVnd'),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  const citations = buildStructuredCitations(
    retrievedChunks,
    recommendedBikes,
    matchedCatalogBikes,
    matchedAccessories,
    intent,
    safeLocale
  );

  // Format concise prompt context blocks (humanized & scoped so Gemini stays strictly focused)
  const policyChunksText =
    retrievedChunks.length > 0
      ? retrievedChunks
          .map(
            (chunk) =>
              `[${chunk.sectionId}] (${chunk.url}) ${chunk.title} — ${chunk.heading}\n${chunk.snippet}`
          )
          .join('\n\n')
      : 'No policy excerpts needed for this query.';

  const promptBikes =
    (catalogScopeStatus === 'SCOPED_BRAND' || catalogScopeStatus === 'SCOPED_MODELS') &&
    matchedCatalogBikes.length > 0
      ? matchedCatalogBikes
      : liveBikes.slice(0, 8);

  const catalogLines = [];
  if (catalogScopeStatus === 'UNSTOCKED_BRAND') {
    catalogLines.push(
      `Scope Filter: Requested brand(s) NOT stocked in DirtFit catalog: ${catalogEntities.unstockedBrands.join(', ')}. Stocked brands: ${stockedBrandNames.join(', ')}.`
    );
  } else if (catalogScopeStatus === 'SCOPED_BRAND' || catalogScopeStatus === 'SCOPED_MODELS') {
    catalogLines.push(
      `Scope Filter: User asked specifically for ${matchedCatalogBikes.map((b) => b.name).join(', ')}. Answer strictly about these matched model(s) — do not list unrelated brands.`
    );
  }

  for (const bike of promptBikes) {
    const unladen = bike.geometrySpec?.unladenSeatHeightMm ?? 'N/A';
    const seatWidth = bike.geometrySpec?.seatWidthMm ?? 'N/A';
    const wetWeight = bike.geometrySpec?.wetWeightKg ?? 'N/A';
    const clearance = bike.geometrySpec?.groundClearanceMm ?? 'N/A';
    const categoryLabel = formatCategoryLabel(bike.category, safeLocale);
    const topAccessories = (bike.compatibilities ?? [])
      .filter((c) => c.accessory?.sku && c.accessory?.name && c.accessory?.status === 'ACTIVE')
      .slice(0, 2)
      .map((c) => `${c.accessory.name} (sku: ${c.accessory.sku})`);
    const accSuffix =
      topAccessories.length > 0 ? `, accessories: [${topAccessories.join('; ')}]` : '';
    catalogLines.push(
      `- ${bike.name} (slug: ${bike.slug}, segment: ${categoryLabel}, engineCc: ${bike.engineCc}cc, unladenSeatMm: ${unladen}mm, seatWidthMm: ${seatWidth}mm, wetWeightKg: ${wetWeight}kg, groundClearanceMm: ${clearance}mm, price: ${formatPromptVnd(bike.priceVnd)}, deposit: ${formatPromptVnd(bike.depositAmountVnd)}, availableQty: ${bike.availableQty}${accSuffix})`
    );
  }

  if (matchedAccessories.length > 0) {
    catalogLines.push(
      `Matched Accessories: ${matchedAccessories.map((a) => `${a.name} (sku: ${a.sku}, price: ${formatPromptVnd(a.priceVnd)}, availableQty: ${a.availableQty})`).join(' | ')}`
    );
  }

  if (intent === CHAT_INTENTS.SHOWROOM_TEST_RIDE) {
    catalogLines.push(`Showrooms: ${SHOWROOMS.map((s) => `${s.name} — ${s.address}`).join(' | ')}`);
  }
  if (scopedOrders.length > 0) {
    catalogLines.push(`Authenticated User Recent Orders (no PII): ${JSON.stringify(scopedOrders)}`);
  }

  const liveCatalogText = catalogLines.join('\n') || 'Catalog temporarily empty.';

  const ergonomicsText =
    effectiveRiderProfile && recommendedBikes.length > 0
      ? JSON.stringify({
          riderProfile: {
            heightCm: effectiveRiderProfile.heightCm,
            weightKg: effectiveRiderProfile.weightKg,
            inseamCm: effectiveRiderProfile.inseamCm,
            footwear: formatFootwearLabel(effectiveRiderProfile.footwear, safeLocale),
          },
          recommendedBikes: recommendedBikes.map((b) => ({
            ...b,
            category: formatCategoryLabel(b.category, safeLocale),
            contactStatus: formatContactLabel(b.contactStatus, safeLocale),
          })),
        })
      : 'No ergonomics evaluation requested for this turn.';

  const historyText =
    history.length > 0
      ? history
          .slice(-6)
          .map((turn) => `${turn.role}: ${String(turn.content).slice(0, 260)}`)
          .join('\n')
      : 'None (new conversation).';

  const renderedPrompt = renderGroundedPrompt(getChatbotPrompts(), {
    locale: safeLocale,
    detectedIntent: intent,
    policyChunks: policyChunksText,
    liveCatalogContext: liveCatalogText,
    ergonomicsEvaluation: ergonomicsText,
    conversationHistory: historyText,
    userMessage: message,
  });

  return {
    intent,
    locale: safeLocale,
    hasPolicySignal,
    entities,
    catalogEntities,
    catalogScopeStatus,
    stockedBrandNames,
    historyRiderProfile,
    userId,
    retrievedChunks,
    citations,
    recommendedBikes,
    matchedCatalogBikes,
    matchedAccessories,
    liveBikes,
    groundedAccessories,
    effectiveRiderProfile,
    scopedOrders,
    renderedPrompt,
  };
}
