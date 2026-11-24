export const ENGINE_VERSION = '1.0.0';

export const RIDER_LIMITS = Object.freeze({
  heightCm: Object.freeze({ min: 135, max: 220 }),
  weightKg: Object.freeze({ min: 35, max: 160 }),
  inseamCm: Object.freeze({ min: 58, max: 115 }),
  gearWeightKg: Object.freeze({ min: 0, max: 35 }),
});

export const MOD_LIMITS = Object.freeze({
  loweringLinkMm: Object.freeze({ min: 0, max: 50 }),
  forkDropMm: Object.freeze({ min: 0, max: 15 }),
  lowSeatMm: Object.freeze({ min: 0, max: 45 }),
  seatWidthReductionMm: Object.freeze({ min: 0, max: 30 }),
  barRiserMm: Object.freeze({ min: 0, max: 50 }),
  barBackOffsetMm: Object.freeze({ min: -20, max: 30 }),
  pegLowerMm: Object.freeze({ min: 0, max: 25 }),
  springRateOverrideRatio: Object.freeze({ min: 0.7, max: 1.4 }),
});

export const FOOTWEAR_PROFILES = Object.freeze({
  SNEAKERS: Object.freeze({
    soleThicknessMm: 25,
    ankleFlexLimitDeg: 35,
    defaultGearWeightKg: 4,
  }),
  ADV_BOOTS: Object.freeze({
    soleThicknessMm: 35,
    ankleFlexLimitDeg: 22,
    defaultGearWeightKg: 7,
  }),
  MX_BOOTS: Object.freeze({
    soleThicknessMm: 42,
    ankleFlexLimitDeg: 15,
    defaultGearWeightKg: 10,
  }),
});

export const FOAM_COMPRESSION_PROFILES = Object.freeze({
  FIRM: Object.freeze({ baseMm: 4, slope: 0.04, minMm: 4, maxMm: 9 }),
  MEDIUM: Object.freeze({ baseMm: 6, slope: 0.07, minMm: 6, maxMm: 14 }),
  PLUSH: Object.freeze({ baseMm: 8, slope: 0.1, minMm: 8, maxMm: 19 }),
});

export const SAG_THRESHOLDS = Object.freeze({
  tooStiffMaxPercent: 26,
  optimalMaxPercent: 37,
  softMaxPercent: 45,
  maxClampRatio: 0.52,
  minAdditionalSagMm: 10,
});

export const SAG_STATUSES = Object.freeze({
  TOO_STIFF: 'TOO_STIFF',
  OPTIMAL: 'OPTIMAL',
  SOFT: 'SOFT',
  BOTTOMING_RISK: 'BOTTOMING_RISK',
});

export const CONTACT_STATUSES = Object.freeze({
  FLAT_FOOT: 'FLAT_FOOT',
  BALLS_OF_FEET: 'BALLS_OF_FEET',
  TIP_TOE: 'TIP_TOE',
  ONE_FOOT_SHIFT: 'ONE_FOOT_SHIFT',
  TOO_TALL_UNSAFE: 'TOO_TALL_UNSAFE',
});

export const STANCE_MODES = Object.freeze({
  SEATED_BOTH_FEET: 'SEATED_BOTH_FEET',
  SEATED_ONE_FOOT: 'SEATED_ONE_FOOT',
  SEATED_RIDING: 'SEATED_RIDING',
  STANDING_ATTACK: 'STANDING_ATTACK',
});

/**
 * Clamp a numeric value strictly inside [min, max].
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Round a floating point value to fixed decimal precision.
 * @param {number} value
 * @param {number} [decimals]
 * @returns {number}
 */
export function roundTo(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
