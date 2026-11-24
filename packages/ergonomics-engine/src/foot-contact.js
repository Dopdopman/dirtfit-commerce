import {
  CONTACT_STATUSES,
  FOOTWEAR_PROFILES,
  clamp,
  degToRad,
  radToDeg,
  roundTo,
} from './constants.js';
import { normalizeModifications } from './sag.js';

/** @typedef {import('./types.js').RiderProfileInput} RiderProfileInput */
/** @typedef {import('./types.js').BikeGeometryInput} BikeGeometryInput */
/** @typedef {import('./types.js').SagResult} SagResult */
/** @typedef {import('./types.js').AnthropometryResult} AnthropometryResult */
/** @typedef {import('./types.js').BikeModificationsInput} BikeModificationsInput */
/** @typedef {import('./types.js').FootContactResult} FootContactResult */

/**
 * Evaluate ground contact reach accounting for seat width wrap, lateral splay, and boot stiffness.
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bike
 * @param {SagResult} sagResult
 * @param {AnthropometryResult} anthropometry
 * @param {BikeModificationsInput} [mods]
 * @returns {FootContactResult}
 */
export function calculateFootContact(rider, bike, sagResult, anthropometry, mods = {}) {
  const safeMods = normalizeModifications(mods);
  const footwearProfile =
    FOOTWEAR_PROFILES[rider.footwear ?? 'ADV_BOOTS'] ?? FOOTWEAR_PROFILES.ADV_BOOTS;

  const effectiveSeatWidthMm = Math.max(125, bike.seatWidthMm - safeMods.seatWidthReductionMm);
  const wrapLossMm = Math.max(0, (effectiveSeatWidthMm - 140) * 0.22);
  const lateralFootOffsetMm = Math.max(150, 0.65 * effectiveSeatWidthMm + 65);
  const dx = Math.max(0, lateralFootOffsetMm - anthropometry.hipHalfWidthMm);

  const availableLegLengthMm =
    anthropometry.inseamMm + footwearProfile.soleThicknessMm - wrapLossMm;

  const flatFootReachMm = Math.sqrt(Math.max(0, availableLegLengthMm ** 2 - dx ** 2));
  const heightDeficitMm = sagResult.effectiveSeatHeightMm - flatFootReachMm;

  const ballReachGainMm =
    anthropometry.ankleToBallMm * Math.sin(degToRad(footwearProfile.ankleFlexLimitDeg));
  const maxToeAngleDeg = Math.min(50, footwearProfile.ankleFlexLimitDeg + 10);
  const toeReachGainMm = anthropometry.ankleToToeMm * Math.sin(degToRad(maxToeAngleDeg));
  const oneFootShiftBonusMm = 78 + Math.max(0, (effectiveSeatWidthMm - 160) * 0.15);

  let contactStatus;
  let footContactPercent;
  let ankleAngleDeg = 0;

  if (heightDeficitMm <= 0) {
    contactStatus = CONTACT_STATUSES.FLAT_FOOT;
    footContactPercent = 100;
  } else if (heightDeficitMm <= ballReachGainMm) {
    contactStatus = CONTACT_STATUSES.BALLS_OF_FEET;
    const ratio = ballReachGainMm > 0 ? heightDeficitMm / ballReachGainMm : 1;
    footContactPercent = 95 - ratio * 50;
    ankleAngleDeg = radToDeg(
      Math.asin(clamp(heightDeficitMm / Math.max(1, anthropometry.ankleToBallMm), 0, 1))
    );
  } else if (heightDeficitMm <= toeReachGainMm) {
    contactStatus = CONTACT_STATUSES.TIP_TOE;
    const span = Math.max(1, toeReachGainMm - ballReachGainMm);
    const ratio = (heightDeficitMm - ballReachGainMm) / span;
    footContactPercent = 44 - ratio * 29;
    ankleAngleDeg = radToDeg(
      Math.asin(clamp(heightDeficitMm / Math.max(1, anthropometry.ankleToToeMm), 0, 1))
    );
  } else if (heightDeficitMm <= toeReachGainMm + oneFootShiftBonusMm) {
    contactStatus = CONTACT_STATUSES.ONE_FOOT_SHIFT;
    footContactPercent = 0;
    ankleAngleDeg = maxToeAngleDeg;
  } else {
    contactStatus = CONTACT_STATUSES.TOO_TALL_UNSAFE;
    footContactPercent = 0;
    ankleAngleDeg = maxToeAngleDeg;
  }

  // Relaxed knee bend when flat-footed (surplus vertical reach softens knee angle)
  let kneeBendAtStopDeg = 178;
  if (heightDeficitMm < 0) {
    const verticalRequired = Math.max(
      100,
      sagResult.effectiveSeatHeightMm - footwearProfile.soleThicknessMm
    );
    const legSpanRatio = clamp(
      Math.hypot(dx, verticalRequired) /
        Math.max(1, anthropometry.thighLenMm + anthropometry.shinLenMm),
      0.5,
      0.998
    );
    const l1 = anthropometry.thighLenMm;
    const l2 = anthropometry.shinLenMm;
    const dist = legSpanRatio * (l1 + l2);
    const cosKnee = clamp((l1 ** 2 + l2 ** 2 - dist ** 2) / (2 * l1 * l2), -1, 1);
    kneeBendAtStopDeg = radToDeg(Math.acos(cosKnee));
  }

  // Evaluate 1-foot hip shift reach (eliminates lateral splay and drops hip by bonus)
  const oneFootReachMm = availableLegLengthMm + oneFootShiftBonusMm;
  const oneFootDeficitMm = sagResult.effectiveSeatHeightMm - oneFootReachMm;
  let oneFootContactStatus;
  let oneFootContactPercent;

  if (oneFootDeficitMm <= 0) {
    oneFootContactStatus = CONTACT_STATUSES.FLAT_FOOT;
    oneFootContactPercent = 100;
  } else if (oneFootDeficitMm <= ballReachGainMm) {
    oneFootContactStatus = CONTACT_STATUSES.BALLS_OF_FEET;
    const ratio = ballReachGainMm > 0 ? oneFootDeficitMm / ballReachGainMm : 1;
    oneFootContactPercent = 95 - ratio * 50;
  } else if (oneFootDeficitMm <= toeReachGainMm) {
    oneFootContactStatus = CONTACT_STATUSES.TIP_TOE;
    const span = Math.max(1, toeReachGainMm - ballReachGainMm);
    const ratio = (oneFootDeficitMm - ballReachGainMm) / span;
    oneFootContactPercent = 44 - ratio * 29;
  } else {
    oneFootContactStatus = CONTACT_STATUSES.TOO_TALL_UNSAFE;
    oneFootContactPercent = 0;
  }

  return {
    effectiveSeatWidthMm: roundTo(effectiveSeatWidthMm, 1),
    wrapLossMm: roundTo(wrapLossMm, 1),
    lateralFootOffsetMm: roundTo(lateralFootOffsetMm, 1),
    availableLegLengthMm: roundTo(availableLegLengthMm, 1),
    flatFootReachMm: roundTo(flatFootReachMm, 1),
    heightDeficitMm: roundTo(heightDeficitMm, 1),
    contactStatus,
    footContactPercent: Math.round(clamp(footContactPercent, 0, 100)),
    ankleAngleDeg: roundTo(ankleAngleDeg, 1),
    kneeBendAtStopDeg: roundTo(kneeBendAtStopDeg, 1),
    oneFootContactStatus,
    oneFootContactPercent: Math.round(clamp(oneFootContactPercent, 0, 100)),
  };
}
