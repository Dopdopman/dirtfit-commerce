import {
  buildParametricWireframe,
  compareTwoBikes,
  computeCalibrationMetrics,
  evaluateBikeFit,
  normalizeModifications,
} from '@dirtfit/ergonomics-engine';
import { AppError, ERROR_CODES } from '@dirtfit/shared';
import {
  computeAvailableQty,
  getActiveReservedQtyByAccessoryIds,
  getActiveReservedQtyByBikeIds,
} from '../../common/inventory/availability.js';
import { findActiveBikeByIdOrSlug } from '../catalog/catalog.repository.js';

/**
 * Normalize either nested riderProfile or flat query/body rider fields into engine RiderProfileInput.
 * @param {object} payload
 * @returns {object}
 */
function normalizeRiderInput(payload) {
  const source = payload.riderProfile ?? payload;
  return {
    heightCm: source.heightCm,
    weightKg: source.weightKg,
    inseamCm: source.inseamCm ?? null,
    gender: source.gender ?? 'UNSPECIFIED',
    bodyProportion: source.bodyProportion ?? 'AVERAGE',
    footwear: source.footwear ?? source.bootType ?? payload.bootType ?? 'ADV_BOOTS',
    gearWeightKg: source.gearWeightKg,
    ridingExperience: source.ridingExperience ?? 'INTERMEDIATE',
    targetTerrain: source.targetTerrain ?? 'DUAL_SPORT',
    stanceMode: source.stanceMode ?? 'SEATED_BOTH_FEET',
  };
}

/**
 * Extract merged ergonomic modifications from flat body fields + mods/customMods + selected accessories.
 * @param {object} payload
 * @param {Array<object>} selectedCompatibilities
 * @returns {object}
 */
function resolveSimulationMods(payload, selectedCompatibilities = []) {
  const accTotals = {
    loweringLinkMm: 0,
    forkDropMm: 0,
    lowSeatMm: 0,
    seatWidthReductionMm: 0,
    barRiserMm: 0,
    barBackOffsetMm: 0,
    pegLowerMm: 0,
    springRateOverrideRatio: undefined,
  };

  for (const comp of selectedCompatibilities) {
    const impact = comp.effectiveErgoImpact;
    accTotals.loweringLinkMm += impact.loweringLinkMm ?? 0;
    accTotals.forkDropMm += impact.forkDropMm ?? 0;
    accTotals.lowSeatMm += impact.lowSeatMm ?? 0;
    accTotals.seatWidthReductionMm += impact.seatWidthReductionMm ?? 0;
    accTotals.barRiserMm += impact.barRiserMm ?? 0;
    accTotals.barBackOffsetMm += impact.barBackOffsetMm ?? 0;
    accTotals.pegLowerMm += impact.pegLowerMm ?? 0;
    if (typeof impact.springRateRatio === 'number') {
      accTotals.springRateOverrideRatio = impact.springRateRatio;
    }
  }

  const explicit = payload.customMods ?? payload.mods ?? {};
  const rawCombined = {
    loweringLinkMm:
      accTotals.loweringLinkMm + (payload.loweringLinkMm ?? explicit.loweringLinkMm ?? 0),
    forkDropMm: accTotals.forkDropMm + (payload.forkDropMm ?? explicit.forkDropMm ?? 0),
    lowSeatMm: accTotals.lowSeatMm + (payload.lowSeatMm ?? explicit.lowSeatMm ?? 0),
    seatWidthReductionMm:
      accTotals.seatWidthReductionMm +
      (payload.seatWidthReductionMm ?? explicit.seatWidthReductionMm ?? 0),
    barRiserMm: accTotals.barRiserMm + (payload.barRiserMm ?? explicit.barRiserMm ?? 0),
    barBackOffsetMm:
      accTotals.barBackOffsetMm + (payload.barBackOffsetMm ?? explicit.barBackOffsetMm ?? 0),
    pegLowerMm: accTotals.pegLowerMm + (payload.pegLowerMm ?? explicit.pegLowerMm ?? 0),
    springRateOverrideRatio:
      payload.springRateOverrideRatio ??
      explicit.springRateOverrideRatio ??
      accTotals.springRateOverrideRatio ??
      1,
  };

  return normalizeModifications(rawCombined);
}

/**
 * Enrich compatible bike accessories with live Lazy Expiration availability and effective drops.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {Array<object>} compatibilities
 * @returns {Promise<Array<object>>}
 */
async function resolveLiveCompatibilities(prisma, compatibilities) {
  const accIds = compatibilities.map((c) => c.accessoryId);
  const reservedMap = await getActiveReservedQtyByAccessoryIds(prisma, accIds);

  return compatibilities
    .filter((comp) => comp.accessory && comp.accessory.status === 'ACTIVE')
    .map((comp) => {
      const activeReservedQty = reservedMap.get(comp.accessoryId) ?? 0;
      const availableQty = computeAvailableQty(comp.accessory.stockQty, activeReservedQty);
      const baseImpact = comp.accessory.ergoImpactJson ?? {};
      const effectiveErgoImpact = {
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
        activeReservedQty,
        effectiveErgoImpact,
        engineInput: {
          id: comp.accessory.id,
          name: comp.accessory.name,
          category: comp.accessory.category,
          priceVnd: comp.accessory.priceVnd,
          installLaborVnd: comp.installLaborVnd ?? 0,
          ergoImpact: effectiveErgoImpact,
        },
        upsellAccessoryDto: {
          id: comp.accessory.id,
          sku: comp.accessory.sku,
          name: comp.accessory.name,
          slug: comp.accessory.slug,
          category: comp.accessory.category,
          priceVnd: comp.accessory.priceVnd,
          installLaborVnd: comp.installLaborVnd ?? 0,
          totalPriceWithInstallVnd: comp.accessory.priceVnd + (comp.installLaborVnd ?? 0),
          availableQty,
          requiresWorkshopInstall: comp.requiresWorkshopInstall,
          fitmentNotes: comp.fitmentNotes,
          imageUrl: comp.accessory.imageUrl,
          ergoImpact: effectiveErgoImpact,
        },
      };
    });
}

/**
 * Compute calibration metrics if the bike has a calibrated SIDE_PROFILE_BLUEPRINT photo.
 * @param {object} bike
 * @returns {object|null}
 */
function resolvePrimaryCalibrationMetrics(bike) {
  const blueprint = bike.media?.find(
    (m) => m.mediaType === 'SIDE_PROFILE_BLUEPRINT' && m.calibrationData
  );
  if (!blueprint?.calibrationData || !bike.geometrySpec) {
    return null;
  }
  return {
    mediaId: blueprint.id,
    imageUrl: blueprint.url,
    calibrationData: blueprint.calibrationData,
    metrics: computeCalibrationMetrics(blueprint.calibrationData, bike.geometrySpec),
  };
}

/**
 * Simulate rider fit server-side on a motorcycle with optional mods and live DB Smart Upsell items.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function simulateErgonomics(app, payload) {
  const bike = await findActiveBikeByIdOrSlug(app.prisma, {
    bikeId: payload.bikeId,
    slug: payload.slug,
  });

  if (!bike || !bike.geometrySpec) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: 'No active motorcycle with geometry specifications matched the given identifier.',
    });
  }

  const [bikeReservedMap, enrichedCompatibilities] = await Promise.all([
    getActiveReservedQtyByBikeIds(app.prisma, [bike.id]),
    resolveLiveCompatibilities(app.prisma, bike.compatibilities),
  ]);

  const bikeAvailableQty = computeAvailableQty(bike.stockQty, bikeReservedMap.get(bike.id) ?? 0);

  const selectedIds = new Set(payload.accessoryIds ?? []);
  const selectedCompatibilities = enrichedCompatibilities.filter((c) =>
    selectedIds.has(c.accessoryId)
  );
  const inStockCompatibilities = enrichedCompatibilities.filter((c) => c.availableQty > 0);
  const upsellLookup = new Map(
    inStockCompatibilities.map((c) => [c.accessoryId, c.upsellAccessoryDto])
  );

  const riderProfile = normalizeRiderInput(payload);
  const appliedMods = resolveSimulationMods(payload, selectedCompatibilities);
  const evaluation = evaluateBikeFit(
    riderProfile,
    bike.geometrySpec,
    appliedMods,
    inStockCompatibilities.map((c) => c.engineInput)
  );
  const wireframe = buildParametricWireframe(bike.geometrySpec, evaluation.sag, appliedMods);
  const calibration = resolvePrimaryCalibrationMetrics(bike);

  const enrichedUpsells = evaluation.upsellSuggestions.map((suggestion) => ({
    ...suggestion,
    accessories: suggestion.accessoryIds.map((accId) => upsellLookup.get(accId)).filter(Boolean),
  }));

  return {
    bike: {
      id: bike.id,
      sku: bike.sku,
      name: bike.name,
      slug: bike.slug,
      modelYear: bike.modelYear,
      category: bike.category,
      ridingFocus: bike.ridingFocus,
      priceVnd: bike.priceVnd,
      depositAmountVnd: bike.depositAmountVnd,
      availableQty: bikeAvailableQty,
      brand: bike.brand,
      geometrySpec: bike.geometrySpec,
    },
    riderProfile,
    appliedMods,
    anthropometry: evaluation.anthropometry,
    sag: evaluation.sag,
    footContact: evaluation.footContact,
    kinematics: evaluation.kinematics,
    fitScore: evaluation.fitScore,
    fitGrade: evaluation.fitGrade,
    warnings: evaluation.warnings,
    upsellSuggestions: enrichedUpsells,
    compatibleInStockAccessories: inStockCompatibilities.map((c) => c.upsellAccessoryDto),
    wireframe,
    calibration,
  };
}

/**
 * Compare two active motorcycles side-by-side for Ghost Overlay visualization.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} payload
 * @returns {Promise<object>}
 */
export async function compareErgonomics(app, payload) {
  const refA = payload.bikeIds ? { bikeId: payload.bikeIds[0] } : { slug: payload.slugs[0] };
  const refB = payload.bikeIds ? { bikeId: payload.bikeIds[1] } : { slug: payload.slugs[1] };

  const [bikeA, bikeB] = await Promise.all([
    findActiveBikeByIdOrSlug(app.prisma, refA),
    findActiveBikeByIdOrSlug(app.prisma, refB),
  ]);

  if (!bikeA?.geometrySpec || !bikeB?.geometrySpec) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: 'One or both motorcycles requested for comparison do not exist or are inactive.',
    });
  }

  const riderProfile = normalizeRiderInput(payload);
  const modsA = normalizeModifications(payload.modsA ?? {});
  const modsB = normalizeModifications(payload.modsB ?? {});

  const comparison = compareTwoBikes(riderProfile, bikeA.geometrySpec, bikeB.geometrySpec, {
    modsA,
    modsB,
    alignmentMode: payload.alignmentMode ?? 'REAR_AXLE_GROUND',
  });

  return {
    alignmentMode: comparison.alignmentMode,
    riderProfile,
    bikeA: {
      meta: {
        id: bikeA.id,
        name: bikeA.name,
        slug: bikeA.slug,
        category: bikeA.category,
        priceVnd: bikeA.priceVnd,
        brand: bikeA.brand,
      },
      calibration: resolvePrimaryCalibrationMetrics(bikeA),
      ...comparison.bikeA,
    },
    bikeB: {
      meta: {
        id: bikeB.id,
        name: bikeB.name,
        slug: bikeB.slug,
        category: bikeB.category,
        priceVnd: bikeB.priceVnd,
        brand: bikeB.brand,
      },
      calibration: resolvePrimaryCalibrationMetrics(bikeB),
      ...comparison.bikeB,
    },
    deltas: comparison.deltas,
  };
}
