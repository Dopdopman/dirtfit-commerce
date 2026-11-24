import { RIDER_LIMITS, clamp, roundTo } from './constants.js';

/** @typedef {import('./types.js').RiderProfileInput} RiderProfileInput */
/** @typedef {import('./types.js').AnthropometryResult} AnthropometryResult */

const PROPORTION_MULTIPLIERS = Object.freeze({
  SHORT_LEGS: 0.965,
  AVERAGE: 1.0,
  LONG_LEGS: 1.035,
});

/**
 * Estimate barefoot inseam length (cm) from height, gender, and leg proportion.
 * @param {object} params
 * @param {number} params.heightCm
 * @param {'MALE'|'FEMALE'|'UNSPECIFIED'} [params.gender]
 * @param {'SHORT_LEGS'|'AVERAGE'|'LONG_LEGS'} [params.bodyProportion]
 * @returns {number}
 */
export function estimateInseamCm({ heightCm, gender = 'UNSPECIFIED', bodyProportion = 'AVERAGE' }) {
  const safeHeightCm = clamp(heightCm, RIDER_LIMITS.heightCm.min, RIDER_LIMITS.heightCm.max);
  const baseInseamCm =
    gender === 'FEMALE' ? 0.472 * safeHeightCm - 2.6 : 0.468 * safeHeightCm - 2.1;
  const multiplier = PROPORTION_MULTIPLIERS[bodyProportion] ?? PROPORTION_MULTIPLIERS.AVERAGE;
  return roundTo(
    clamp(baseInseamCm * multiplier, RIDER_LIMITS.inseamCm.min, RIDER_LIMITS.inseamCm.max),
    1
  );
}

/**
 * Compute normalized rider body segment lengths in millimeters (Drillis & Contini ratios).
 * @param {RiderProfileInput} rider
 * @returns {AnthropometryResult}
 */
export function computeAnthropometry(rider) {
  const safeHeightCm = clamp(rider.heightCm, RIDER_LIMITS.heightCm.min, RIDER_LIMITS.heightCm.max);
  const hasExplicitInseam = typeof rider.inseamCm === 'number' && Number.isFinite(rider.inseamCm);

  const inseamCm = hasExplicitInseam
    ? clamp(rider.inseamCm, RIDER_LIMITS.inseamCm.min, RIDER_LIMITS.inseamCm.max)
    : estimateInseamCm({
        heightCm: safeHeightCm,
        gender: rider.gender ?? 'UNSPECIFIED',
        bodyProportion: rider.bodyProportion ?? 'AVERAGE',
      });

  const heightMm = safeHeightCm * 10;
  const inseamMm = inseamCm * 10;
  const footLengthMm = 0.152 * heightMm;

  return {
    heightMm: roundTo(heightMm, 1),
    inseamMm: roundTo(inseamMm, 1),
    inseamCm: roundTo(inseamCm, 1),
    isInseamEstimated: !hasExplicitInseam,
    thighLenMm: roundTo(0.53 * inseamMm, 1),
    shinLenMm: roundTo(0.47 * inseamMm, 1),
    ankleHeightMm: roundTo(0.042 * heightMm, 1),
    footLengthMm: roundTo(footLengthMm, 1),
    ankleToBallMm: roundTo(0.68 * footLengthMm, 1),
    ankleToToeMm: roundTo(0.9 * footLengthMm, 1),
    torsoLenMm: roundTo(0.3 * heightMm + (0.455 * heightMm - inseamMm) * 0.45, 1),
    upperArmLenMm: roundTo(0.186 * heightMm, 1),
    forearmPlusHandMm: roundTo(0.186 * heightMm, 1),
    hipHalfWidthMm: roundTo(0.049 * heightMm, 1),
  };
}
