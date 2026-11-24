import {
  FOAM_COMPRESSION_PROFILES,
  FOOTWEAR_PROFILES,
  MOD_LIMITS,
  RIDER_LIMITS,
  SAG_STATUSES,
  SAG_THRESHOLDS,
  clamp,
  roundTo,
} from './constants.js';

/** @typedef {import('./types.js').RiderProfileInput} RiderProfileInput */
/** @typedef {import('./types.js').BikeGeometryInput} BikeGeometryInput */
/** @typedef {import('./types.js').BikeModificationsInput} BikeModificationsInput */
/** @typedef {import('./types.js').SagResult} SagResult */

/**
 * Normalize and clamp bike modification inputs within safe physical limits.
 * @param {BikeModificationsInput} [mods]
 * @returns {Required<BikeModificationsInput>}
 */
export function normalizeModifications(mods = {}) {
  return {
    loweringLinkMm: clamp(
      mods.loweringLinkMm ?? 0,
      MOD_LIMITS.loweringLinkMm.min,
      MOD_LIMITS.loweringLinkMm.max
    ),
    forkDropMm: clamp(mods.forkDropMm ?? 0, MOD_LIMITS.forkDropMm.min, MOD_LIMITS.forkDropMm.max),
    lowSeatMm: clamp(mods.lowSeatMm ?? 0, MOD_LIMITS.lowSeatMm.min, MOD_LIMITS.lowSeatMm.max),
    seatWidthReductionMm: clamp(
      mods.seatWidthReductionMm ?? 0,
      MOD_LIMITS.seatWidthReductionMm.min,
      MOD_LIMITS.seatWidthReductionMm.max
    ),
    barRiserMm: clamp(mods.barRiserMm ?? 0, MOD_LIMITS.barRiserMm.min, MOD_LIMITS.barRiserMm.max),
    barBackOffsetMm: clamp(
      mods.barBackOffsetMm ?? 0,
      MOD_LIMITS.barBackOffsetMm.min,
      MOD_LIMITS.barBackOffsetMm.max
    ),
    pegLowerMm: clamp(mods.pegLowerMm ?? 0, MOD_LIMITS.pegLowerMm.min, MOD_LIMITS.pegLowerMm.max),
    springRateOverrideRatio: clamp(
      mods.springRateOverrideRatio ?? 1,
      MOD_LIMITS.springRateOverrideRatio.min,
      MOD_LIMITS.springRateOverrideRatio.max
    ),
  };
}

/**
 * Classify rear suspension sag percentage into riding spring-match status.
 * @param {number} sagPercentOfTravel
 * @returns {'TOO_STIFF'|'OPTIMAL'|'SOFT'|'BOTTOMING_RISK'}
 */
function classifySagStatus(sagPercentOfTravel) {
  if (sagPercentOfTravel < SAG_THRESHOLDS.tooStiffMaxPercent) {
    return SAG_STATUSES.TOO_STIFF;
  }
  if (sagPercentOfTravel <= SAG_THRESHOLDS.optimalMaxPercent) {
    return SAG_STATUSES.OPTIMAL;
  }
  if (sagPercentOfTravel <= SAG_THRESHOLDS.softMaxPercent) {
    return SAG_STATUSES.SOFT;
  }
  return SAG_STATUSES.BOTTOMING_RISK;
}

/**
 * Calculate static/rider suspension sag, foam compression, and effective seat height.
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bike
 * @param {BikeModificationsInput} [mods]
 * @returns {SagResult}
 */
export function calculateSuspensionSag(rider, bike, mods = {}) {
  const safeMods = normalizeModifications(mods);
  const footwearProfile =
    FOOTWEAR_PROFILES[rider.footwear ?? 'ADV_BOOTS'] ?? FOOTWEAR_PROFILES.ADV_BOOTS;

  const weightKg = clamp(rider.weightKg, RIDER_LIMITS.weightKg.min, RIDER_LIMITS.weightKg.max);
  const gearWeightKg = clamp(
    rider.gearWeightKg ?? footwearProfile.defaultGearWeightKg,
    RIDER_LIMITS.gearWeightKg.min,
    RIDER_LIMITS.gearWeightKg.max
  );
  const totalRiderMassKg = weightKg + gearWeightKg;

  const referenceMassKg = bike.referenceRiderWeightKg ?? 83;
  const targetRiderSagRatio = bike.targetRiderSagRatio ?? 0.33;
  const alpha = bike.linkageProgressionAlpha ?? 0.85;
  const springRatio = safeMods.springRateOverrideRatio;

  const baseAdditionalRearSag = Math.max(
    10,
    bike.rearTravelMm * targetRiderSagRatio - bike.staticSagRearMm
  );
  const rawAdditionalRearSag =
    (baseAdditionalRearSag / springRatio) * (totalRiderMassKg / referenceMassKg) ** alpha;

  const minRearSagMm = bike.staticSagRearMm + SAG_THRESHOLDS.minAdditionalSagMm;
  const maxRearSagMm = bike.rearTravelMm * SAG_THRESHOLDS.maxClampRatio;
  const rawTotalRearSagMm = bike.staticSagRearMm + rawAdditionalRearSag;

  const totalRearSagMm = clamp(rawTotalRearSagMm, minRearSagMm, maxRearSagMm);
  const isSagClampedMin = rawTotalRearSagMm <= minRearSagMm;
  const isSagClampedMax = rawTotalRearSagMm >= maxRearSagMm;
  const additionalRearSagMm = Math.max(0, totalRearSagMm - bike.staticSagRearMm);

  const sagPercentOfTravel = (totalRearSagMm / bike.rearTravelMm) * 100;
  const sagStatus = classifySagStatus(sagPercentOfTravel);

  const rawAdditionalFrontSag =
    ((0.15 * bike.frontTravelMm) / springRatio) * (totalRiderMassKg / referenceMassKg) ** 0.9;
  const additionalFrontSagMm = clamp(rawAdditionalFrontSag, 8, 0.35 * bike.frontTravelMm);
  const totalFrontSagMm = Math.min(
    bike.frontTravelMm * 0.52,
    bike.staticSagFrontMm + additionalFrontSagMm
  );

  const tSeat = clamp(bike.seatPocketXMm / bike.wheelbaseMm, 0.2, 0.65);
  const seatDropFromSagMm = (1 - tSeat) * additionalRearSagMm + tSeat * additionalFrontSagMm;

  const foamProfile =
    FOAM_COMPRESSION_PROFILES[bike.seatFoamFirmness ?? 'MEDIUM'] ??
    FOAM_COMPRESSION_PROFILES.MEDIUM;
  const seatFoamCompressionMm = clamp(
    foamProfile.baseMm + foamProfile.slope * totalRiderMassKg,
    foamProfile.minMm,
    foamProfile.maxMm
  );

  const modSeatDropMm =
    safeMods.lowSeatMm + (1 - tSeat) * safeMods.loweringLinkMm + tSeat * safeMods.forkDropMm;

  const minRealisticSeatHeightMm = (bike.rearTireOuterRadiusMm ?? 330) + 150;
  const effectiveSeatHeightMm = Math.max(
    minRealisticSeatHeightMm,
    bike.unladenSeatHeightMm - seatDropFromSagMm - seatFoamCompressionMm - modSeatDropMm
  );

  const effectiveGroundClearanceMm = Math.max(
    120,
    bike.groundClearanceMm - safeMods.loweringLinkMm * 0.85
  );

  const warnings = [];
  if (safeMods.loweringLinkMm > 0 && effectiveGroundClearanceMm < 200) {
    warnings.push('LOW_GROUND_CLEARANCE_WARNING');
  }
  if (safeMods.loweringLinkMm >= 20 && safeMods.forkDropMm === 0) {
    warnings.push('FORK_DROP_RECOMMENDED');
  }
  if (sagStatus === SAG_STATUSES.TOO_STIFF) {
    warnings.push('SUSPENSION_TOO_STIFF');
  } else if (sagStatus === SAG_STATUSES.BOTTOMING_RISK) {
    warnings.push('SUSPENSION_BOTTOMING_RISK');
  }

  return {
    totalRiderMassKg: roundTo(totalRiderMassKg, 1),
    additionalRearSagMm: roundTo(additionalRearSagMm, 1),
    totalRearSagMm: roundTo(totalRearSagMm, 1),
    additionalFrontSagMm: roundTo(additionalFrontSagMm, 1),
    totalFrontSagMm: roundTo(totalFrontSagMm, 1),
    sagPercentOfTravel: roundTo(sagPercentOfTravel, 1),
    sagStatus,
    isSagClampedMin,
    isSagClampedMax,
    seatDropFromSagMm: roundTo(seatDropFromSagMm, 1),
    seatFoamCompressionMm: roundTo(seatFoamCompressionMm, 1),
    modSeatDropMm: roundTo(modSeatDropMm, 1),
    effectiveSeatHeightMm: roundTo(effectiveSeatHeightMm, 1),
    effectiveGroundClearanceMm: roundTo(effectiveGroundClearanceMm, 1),
    warnings,
  };
}
