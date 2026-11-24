import { computeCalibrationMetrics, evaluateBikeFit } from '@dirtfit/ergonomics-engine';
import { AppError, ERROR_CODES, USER_ROLES } from '@dirtfit/shared';
import {
  CATALOG_KEYS,
  getOrSetCatalogCache,
  invalidateCatalogCache,
} from '../../common/cache/catalog-cache.js';
import {
  computeAvailableQty,
  getActiveReservedQtyByAccessoryIds,
  getActiveReservedQtyByBikeIds,
} from '../../common/inventory/availability.js';
import { recordAuditLog } from '../audit/audit.service.js';
import {
  createBikeWithGeometry,
  findActiveBikeBySlug,
  findActiveBikesProjection,
  findAdminBikes,
  findAllBrands,
  findBikeById,
  findBikeMediaById,
  findBikeStockMapByIds,
  softDeleteBike,
  updateBikeMediaCalibration,
  updateBikeWithGeometry,
} from './catalog.repository.js';

const CONTACT_RANK = Object.freeze({
  TOO_TALL_UNSAFE: 0,
  ONE_FOOT_SHIFT: 1,
  TIP_TOE: 2,
  BALLS_OF_FEET: 3,
  FLAT_FOOT: 4,
});

const SALES_ALLOWED_BIKE_PATCH_FIELDS = new Set(['stockQty', 'status', 'version']);

/**
 * Build ergonomic accessory list from compatible accessories using bike-specific drops & live availability.
 * @param {Array<object>} compatibilities
 * @param {Map<string, number>} accessoryReservedMap
 * @returns {Array<object>}
 */
function buildCompatibleErgoList(compatibilities, accessoryReservedMap) {
  return compatibilities
    .filter((comp) => comp.accessory && comp.accessory.status === 'ACTIVE')
    .map((comp) => {
      const reserved = accessoryReservedMap.get(comp.accessoryId) ?? 0;
      const availableQty = computeAvailableQty(comp.accessory.stockQty, reserved);
      const baseImpact = comp.accessory.ergoImpactJson ?? {};
      const ergoImpact = {
        ...baseImpact,
        ...(comp.exactSeatDropMm !== null && comp.accessory.category === 'LOW_SEAT'
          ? { lowSeatMm: comp.exactSeatDropMm }
          : {}),
        ...(comp.exactSeatDropMm !== null && comp.accessory.category === 'LOWERING_LINK'
          ? { loweringLinkMm: comp.exactSeatDropMm }
          : {}),
        ...(comp.exactForkDropMm !== null ? { forkDropMm: comp.exactForkDropMm } : {}),
      };

      return {
        ...comp,
        availableQty,
        accessory: {
          ...comp.accessory,
          availableQty,
        },
        ergoInput: {
          id: comp.accessory.id,
          name: comp.accessory.name,
          category: comp.accessory.category,
          priceVnd: comp.accessory.priceVnd,
          installLaborVnd: comp.installLaborVnd ?? 0,
          ergoImpact,
        },
      };
    });
}

/**
 * Extract best stock + modded Rider-Fit preview for catalog filtering and sorting.
 * @param {object} bike
 * @param {object} riderProfile
 * @param {Array<object>} enrichedCompatibilities
 * @returns {object}
 */
function computeCatalogFitPreview(bike, riderProfile, enrichedCompatibilities) {
  const inStockErgo = enrichedCompatibilities
    .filter((c) => c.availableQty > 0)
    .map((c) => c.ergoInput);

  const stockEval = evaluateBikeFit(riderProfile, bike.geometrySpec, {}, inStockErgo);

  const loweringLink = inStockErgo.find((a) => a.category === 'LOWERING_LINK');
  const lowSeat = inStockErgo.find((a) => a.category === 'LOW_SEAT');
  let bestModdedEval = null;

  if (loweringLink || lowSeat) {
    const bestMods = {
      loweringLinkMm: loweringLink?.ergoImpact?.loweringLinkMm ?? 0,
      forkDropMm: loweringLink?.ergoImpact?.forkDropMm ?? 0,
      lowSeatMm: lowSeat?.ergoImpact?.lowSeatMm ?? 0,
      seatWidthReductionMm: lowSeat?.ergoImpact?.seatWidthReductionMm ?? 0,
    };
    bestModdedEval = evaluateBikeFit(riderProfile, bike.geometrySpec, bestMods, []);
  }

  const stockRank = CONTACT_RANK[stockEval.footContact.contactStatus] ?? 0;
  const moddedRank = bestModdedEval
    ? (CONTACT_RANK[bestModdedEval.footContact.contactStatus] ?? 0)
    : stockRank;
  const isModdableToFit = stockRank < 2 && moddedRank >= 2;

  return {
    fitScore: stockEval.fitScore,
    fitGrade: stockEval.fitGrade,
    contactStatus: stockEval.footContact.contactStatus,
    footContactPercent: stockEval.footContact.footContactPercent,
    effectiveSeatHeightMm: stockEval.sag.effectiveSeatHeightMm,
    sagStatus: stockEval.sag.sagStatus,
    isModdableToFit,
    bestModdedFitScore: bestModdedEval ? bestModdedEval.fitScore : stockEval.fitScore,
    bestModdedContactStatus: bestModdedEval
      ? bestModdedEval.footContact.contactStatus
      : stockEval.footContact.contactStatus,
    bestModdedSeatHeightMm: bestModdedEval
      ? bestModdedEval.sag.effectiveSeatHeightMm
      : stockEval.sag.effectiveSeatHeightMm,
    _stockRank: stockRank,
    _moddedRank: moddedRank,
  };
}

/**
 * Determine whether a bike matches the requested Rider-Fit filter threshold.
 * @param {object} preview
 * @param {string|undefined} fitFilter
 * @param {boolean} includeModdable
 * @returns {boolean}
 */
function matchesFitThreshold(preview, fitFilter, includeModdable) {
  if (!fitFilter || fitFilter === 'ALL') {
    return true;
  }
  if (fitFilter === 'FIT_NOW') {
    return preview._stockRank >= 2;
  }
  if (fitFilter === 'FIT_WITH_MODS') {
    return preview._stockRank >= 2 || preview._moddedRank >= 2;
  }

  const minRank = CONTACT_RANK[fitFilter] ?? 0;
  if (preview._stockRank >= minRank) {
    return true;
  }
  return Boolean(includeModdable) && preview._moddedRank >= minRank;
}

/**
 * List cached motorcycle brands.
 * @param {import('fastify').FastifyInstance} app
 * @returns {Promise<Array<object>>}
 */
export async function listBrands(app) {
  return getOrSetCatalogCache(app, CATALOG_KEYS.BRANDS, () => findAllBrands(app.prisma), {
    l2TtlSec: 600,
  });
}

/**
 * Public motorcycle catalog with terrain/price filters, Lazy Expiration availability, and Smart Rider-Fit.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object, riderFilterApplied: boolean }>}
 */
export async function listPublicBikes(app, query) {
  const cachedBikes = await getOrSetCatalogCache(
    app,
    CATALOG_KEYS.BIKE_FIT_PROJECTIONS,
    () => findActiveBikesProjection(app.prisma),
    { l2TtlSec: 300 }
  );

  const brandFilter = query.brandSlug ?? query.brand;
  const searchLower = query.search ? query.search.toLowerCase() : null;

  const preFiltered = cachedBikes.filter((bike) => {
    if (query.category && bike.category !== query.category) return false;
    if (query.ridingFocus && bike.ridingFocus !== query.ridingFocus) return false;
    if (brandFilter && bike.brand?.slug !== brandFilter) return false;
    if (query.minPrice !== undefined && bike.priceVnd < query.minPrice) return false;
    if (query.maxPrice !== undefined && bike.priceVnd > query.maxPrice) return false;
    if (query.streetLegal !== undefined && bike.streetLegal !== query.streetLegal) return false;
    if (searchLower) {
      const hay =
        `${bike.name} ${bike.sku} ${bike.brand?.name ?? ''} ${bike.shortSummary ?? ''}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });

  const bikeIds = preFiltered.map((b) => b.id);
  const accessoryIds = Array.from(
    new Set(preFiltered.flatMap((b) => b.compatibilities.map((c) => c.accessoryId)))
  );

  // Lazy Expiration: live stock & unexpired holds always computed directly from DB
  const [liveStockMap, bikeReservedMap, accessoryReservedMap] = await Promise.all([
    findBikeStockMapByIds(app.prisma, bikeIds),
    getActiveReservedQtyByBikeIds(app.prisma, bikeIds),
    getActiveReservedQtyByAccessoryIds(app.prisma, accessoryIds),
  ]);

  const heightCm = query.riderHeightCm ?? query.heightCm;
  const weightKg = query.riderWeightKg ?? query.weightKg;
  const inseamCm = query.riderInseamCm ?? query.inseamCm;
  const footwear = query.footwear ?? query.bootType ?? 'ADV_BOOTS';
  const fitFilter = query.fitFilter ?? query.minFitStatus;
  const riderFilterApplied = heightCm !== undefined;

  const riderProfile = riderFilterApplied
    ? {
        heightCm,
        weightKg: weightKg ?? 72,
        inseamCm: inseamCm ?? null,
        footwear,
      }
    : null;

  let items = preFiltered
    .filter((bike) => liveStockMap.has(bike.id))
    .map((bike) => {
      const currentStockQty = liveStockMap.get(bike.id) ?? bike.stockQty;
      const activeReservedQty = bikeReservedMap.get(bike.id) ?? 0;
      const availableQty = computeAvailableQty(currentStockQty, activeReservedQty);
      const enrichedCompatibilities = buildCompatibleErgoList(
        bike.compatibilities,
        accessoryReservedMap
      );

      let fitPreview = null;
      if (riderProfile && bike.geometrySpec) {
        fitPreview = computeCatalogFitPreview(bike, riderProfile, enrichedCompatibilities);
      }

      return {
        ...bike,
        stockQty: currentStockQty,
        activeReservedQty,
        availableQty,
        compatibilities: enrichedCompatibilities.map(({ ergoInput: _ergo, ...rest }) => rest),
        ...(fitPreview ? { fitPreview } : {}),
      };
    });

  if (riderFilterApplied) {
    items = items
      .filter((item) =>
        item.fitPreview
          ? matchesFitThreshold(item.fitPreview, fitFilter, query.includeModdable)
          : false
      )
      .map((item) => {
        if (!item.fitPreview) {
          return item;
        }
        const { _stockRank, _moddedRank, ...publicFit } = item.fitPreview;
        return {
          ...item,
          fitPreview: publicFit,
        };
      });
  }

  const effectiveSort = query.sortBy ?? (riderFilterApplied ? 'fitScore' : 'newest');
  items.sort((a, b) => {
    if (effectiveSort === 'fitScore' && a.fitPreview && b.fitPreview) {
      const scoreA = query.includeModdable
        ? Math.max(a.fitPreview.fitScore, a.fitPreview.bestModdedFitScore)
        : a.fitPreview.fitScore;
      const scoreB = query.includeModdable
        ? Math.max(b.fitPreview.fitScore, b.fitPreview.bestModdedFitScore)
        : b.fitPreview.fitScore;
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.fitPreview.fitScore !== a.fitPreview.fitScore) {
        return b.fitPreview.fitScore - a.fitPreview.fitScore;
      }
      return a.priceVnd - b.priceVnd;
    }
    if (effectiveSort === 'priceAsc') return a.priceVnd - b.priceVnd;
    if (effectiveSort === 'priceDesc') return b.priceVnd - a.priceVnd;
    if (effectiveSort === 'seatHeightAsc') {
      return (
        (a.geometrySpec?.unladenSeatHeightMm ?? 0) - (b.geometrySpec?.unladenSeatHeightMm ?? 0)
      );
    }
    if (effectiveSort === 'seatHeightDesc') {
      return (
        (b.geometrySpec?.unladenSeatHeightMm ?? 0) - (a.geometrySpec?.unladenSeatHeightMm ?? 0)
      );
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const totalItems = items.length;
  const paged = items.slice((page - 1) * limit, page * limit);

  return {
    items: paged,
    riderFilterApplied,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}

/**
 * Get public motorcycle detail by slug with L1/L2 caching and live Lazy Expiration availability.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} slug
 * @returns {Promise<object>}
 */
export async function getPublicBikeBySlug(app, slug) {
  const cachedBike = await getOrSetCatalogCache(
    app,
    CATALOG_KEYS.bikeDetail(slug),
    () => findActiveBikeBySlug(app.prisma, slug),
    { l2TtlSec: 300 }
  );

  if (!cachedBike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `No active motorcycle found with slug "${slug}".`,
    });
  }

  const accIds = cachedBike.compatibilities.map((c) => c.accessoryId);
  const [liveStockMap, bikeReservedMap, accessoryReservedMap] = await Promise.all([
    findBikeStockMapByIds(app.prisma, [cachedBike.id]),
    getActiveReservedQtyByBikeIds(app.prisma, [cachedBike.id]),
    getActiveReservedQtyByAccessoryIds(app.prisma, accIds),
  ]);

  if (!liveStockMap.has(cachedBike.id)) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Motorcycle "${slug}" is no longer active.`,
    });
  }

  const stockQty = liveStockMap.get(cachedBike.id) ?? cachedBike.stockQty;
  const activeReservedQty = bikeReservedMap.get(cachedBike.id) ?? 0;
  const enrichedCompatibilities = buildCompatibleErgoList(
    cachedBike.compatibilities,
    accessoryReservedMap
  ).map(({ ergoInput: _ergo, ...rest }) => rest);

  return {
    ...cachedBike,
    stockQty,
    activeReservedQty,
    availableQty: computeAvailableQty(stockQty, activeReservedQty),
    compatibilities: enrichedCompatibilities,
  };
}

/**
 * List bikes for Admin/Sales management.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function adminListBikes(app, query) {
  const result = await findAdminBikes(app.prisma, query);
  const bikeIds = result.items.map((b) => b.id);
  const bikeReservedMap = await getActiveReservedQtyByBikeIds(app.prisma, bikeIds);

  return {
    items: result.items.map((bike) => {
      const activeReservedQty = bikeReservedMap.get(bike.id) ?? 0;
      return {
        ...bike,
        activeReservedQty,
        availableQty: computeAvailableQty(bike.stockQty, activeReservedQty),
      };
    }),
    pagination: result.pagination,
  };
}

/**
 * Fetch full motorcycle details by ID for Admin/Sales Portal editing and calibration.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function adminGetBikeById(app, id) {
  const bike = await findBikeById(app.prisma, id);
  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Motorcycle ${id} does not exist.`,
    });
  }

  const accIds = (bike.compatibilities ?? []).map((c) => c.accessoryId);
  const [bikeReservedMap, accessoryReservedMap] = await Promise.all([
    getActiveReservedQtyByBikeIds(app.prisma, [bike.id]),
    getActiveReservedQtyByAccessoryIds(app.prisma, accIds),
  ]);

  const activeReservedQty = bikeReservedMap.get(bike.id) ?? 0;
  return {
    ...bike,
    activeReservedQty,
    availableQty: computeAvailableQty(bike.stockQty, activeReservedQty),
    compatibilities: (bike.compatibilities ?? []).map((comp) => {
      const accReserved = accessoryReservedMap.get(comp.accessoryId) ?? 0;
      return {
        ...comp,
        accessory: comp.accessory
          ? {
              ...comp.accessory,
              activeReservedQty: accReserved,
              availableQty: computeAvailableQty(comp.accessory.stockQty, accReserved),
            }
          : null,
      };
    }),
  };
}

/**
 * Create a new motorcycle and geometry spec (ADMIN only), recording AuditLog and busting caches.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminCreateBike(app, payload, auditCtx) {
  const brand = await app.prisma.brand.findUnique({ where: { id: payload.brandId } });
  if (!brand) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Brand not found',
      detail: `Brand ${payload.brandId} does not exist.`,
    });
  }

  const created = await app.prisma.$transaction(async (tx) => {
    const bike = await createBikeWithGeometry(tx, payload);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_CREATED',
      entityType: 'Bike',
      entityId: bike.id,
      beforeState: null,
      afterState: bike,
    });
    return bike;
  });

  await invalidateCatalogCache(app);
  return {
    ...created,
    activeReservedQty: 0,
    availableQty: created.stockQty,
  };
}

/**
 * Update bike details/price/geometry/stock (ADMIN full; SALES_STAFF stock/status only).
 * @param {import('fastify').FastifyInstance} app
 * @param {string} id
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminUpdateBike(app, id, payload, auditCtx) {
  if (auditCtx.actorRole !== USER_ROLES.ADMIN) {
    const disallowed = Object.keys(payload).filter(
      (key) => !SALES_ALLOWED_BIKE_PATCH_FIELDS.has(key)
    );
    if (disallowed.length > 0) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        status: 403,
        title: 'Insufficient permissions',
        detail: `Role ${auditCtx.actorRole} can only update stockQty or status on motorcycles.`,
      });
    }
  }

  const existing = await findBikeById(app.prisma, id);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Motorcycle ${id} does not exist.`,
    });
  }

  if (payload.version !== undefined && payload.version !== existing.version) {
    throw new AppError({
      code: ERROR_CODES.CONFLICT,
      status: 409,
      title: 'Version conflict',
      detail: 'Motorcycle record was modified concurrently. Please reload and retry.',
    });
  }

  const nextPrice = payload.priceVnd ?? existing.priceVnd;
  const nextDeposit = payload.depositAmountVnd ?? existing.depositAmountVnd;
  if (nextDeposit > nextPrice) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 400,
      title: 'Invalid deposit amount',
      detail: 'depositAmountVnd cannot exceed priceVnd.',
    });
  }

  if (payload.brandId) {
    const brand = await app.prisma.brand.findUnique({ where: { id: payload.brandId } });
    if (!brand) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Brand not found',
        detail: `Brand ${payload.brandId} does not exist.`,
      });
    }
  }

  const updated = await app.prisma.$transaction(async (tx) => {
    const bike = await updateBikeWithGeometry(tx, id, payload);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_UPDATED',
      entityType: 'Bike',
      entityId: bike.id,
      beforeState: {
        priceVnd: existing.priceVnd,
        depositAmountVnd: existing.depositAmountVnd,
        stockQty: existing.stockQty,
        status: existing.status,
        geometrySpec: existing.geometrySpec,
      },
      afterState: {
        priceVnd: bike.priceVnd,
        depositAmountVnd: bike.depositAmountVnd,
        stockQty: bike.stockQty,
        status: bike.status,
        geometrySpec: bike.geometrySpec,
      },
    });
    return bike;
  });

  await invalidateCatalogCache(app);
  const reservedMap = await getActiveReservedQtyByBikeIds(app.prisma, [updated.id]);
  const activeReservedQty = reservedMap.get(updated.id) ?? 0;

  return {
    ...updated,
    activeReservedQty,
    availableQty: computeAvailableQty(updated.stockQty, activeReservedQty),
  };
}

/**
 * Soft-delete a motorcycle, record AuditLog, and invalidate catalog cache.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} id
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminSoftDeleteBike(app, id, auditCtx) {
  const existing = await findBikeById(app.prisma, id);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Motorcycle ${id} does not exist.`,
    });
  }

  const deleted = await app.prisma.$transaction(async (tx) => {
    const row = await softDeleteBike(tx, id);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_SOFT_DELETED',
      entityType: 'Bike',
      entityId: row.id,
      beforeState: { status: existing.status, deletedAt: existing.deletedAt },
      afterState: { status: row.status, deletedAt: row.deletedAt },
    });
    return row;
  });

  await invalidateCatalogCache(app);
  return deleted;
}

/**
 * Validate and persist Admin UV calibration on a motorcycle media asset, recording AuditLog and busting caches.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} bikeId
 * @param {string} mediaId
 * @param {object} calibrationData
 * @param {object} auditCtx
 * @returns {Promise<{ media: object, metrics: object }>}
 */
export async function adminCalibrateBikeMedia(app, bikeId, mediaId, calibrationData, auditCtx) {
  const bike = await findBikeById(app.prisma, bikeId);
  if (!bike || !bike.geometrySpec) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle geometry not found',
      detail: `Active motorcycle ${bikeId} with geometry spec does not exist.`,
    });
  }

  const existingMedia = await findBikeMediaById(app.prisma, bikeId, mediaId);
  if (!existingMedia) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Media asset not found',
      detail: `Media ${mediaId} does not belong to motorcycle ${bikeId}.`,
    });
  }

  const metrics = computeCalibrationMetrics(calibrationData, bike.geometrySpec);
  if (
    !Number.isFinite(metrics.pxPerMm) ||
    metrics.axleSpanPx < 40 ||
    metrics.pxPerMm < 0.05 ||
    metrics.pxPerMm > 10 ||
    metrics.perspectiveErrorPercent > 35
  ) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 422,
      title: 'Calibration geometry out of physical bounds',
      detail: `Computed calibration metrics are invalid (axleSpanPx=${metrics.axleSpanPx}, pxPerMm=${metrics.pxPerMm}, perspectiveError=${metrics.perspectiveErrorPercent}%).`,
    });
  }

  const updatedMedia = await app.prisma.$transaction(async (tx) => {
    const media = await updateBikeMediaCalibration(tx, mediaId, calibrationData);
    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'BIKE_MEDIA_CALIBRATED',
      entityType: 'BikeMedia',
      entityId: media.id,
      beforeState: { calibrationData: existingMedia.calibrationData },
      afterState: { calibrationData, metrics },
    });
    return media;
  });

  await invalidateCatalogCache(app);
  return { media: updatedMedia, metrics };
}
