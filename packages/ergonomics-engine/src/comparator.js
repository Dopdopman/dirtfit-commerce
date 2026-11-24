import { buildParametricWireframe } from './calibration.js';
import { roundTo } from './constants.js';
import { evaluateBikeFit } from './scoring.js';

/** @typedef {import('./types.js').RiderProfileInput} RiderProfileInput */
/** @typedef {import('./types.js').BikeGeometryInput} BikeGeometryInput */
/** @typedef {import('./types.js').BikeModificationsInput} BikeModificationsInput */

/**
 * Compare two motorcycles for the same rider and compute Ghost Overlay alignment transforms.
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bikeA
 * @param {BikeGeometryInput} bikeB
 * @param {object} [options]
 * @param {BikeModificationsInput} [options.modsA]
 * @param {BikeModificationsInput} [options.modsB]
 * @param {'REAR_AXLE_GROUND'|'SEAT_POCKET'} [options.alignmentMode]
 * @returns {object}
 */
export function compareTwoBikes(rider, bikeA, bikeB, options = {}) {
  const modsA = options.modsA ?? {};
  const modsB = options.modsB ?? {};
  const alignmentMode = options.alignmentMode ?? 'REAR_AXLE_GROUND';

  const evalA = evaluateBikeFit(rider, bikeA, modsA);
  const evalB = evaluateBikeFit(rider, bikeB, modsB);

  const seatPocketOffsetX =
    alignmentMode === 'SEAT_POCKET' ? bikeA.seatPocketXMm - bikeB.seatPocketXMm : 0;
  const seatPocketOffsetY =
    alignmentMode === 'SEAT_POCKET'
      ? evalA.sag.effectiveSeatHeightMm - evalB.sag.effectiveSeatHeightMm
      : 0;

  return {
    alignmentMode,
    bikeA: {
      evaluation: evalA,
      wireframe: buildParametricWireframe(bikeA, evalA.sag, modsA),
      overlayOffsetMm: { x: 0, y: 0 },
    },
    bikeB: {
      evaluation: evalB,
      wireframe: buildParametricWireframe(bikeB, evalB.sag, modsB),
      overlayOffsetMm: {
        x: roundTo(seatPocketOffsetX, 1),
        y: roundTo(seatPocketOffsetY, 1),
      },
    },
    deltas: {
      unladenSeatHeightDeltaMm: bikeB.unladenSeatHeightMm - bikeA.unladenSeatHeightMm,
      effectiveSeatHeightDeltaMm: roundTo(
        evalB.sag.effectiveSeatHeightMm - evalA.sag.effectiveSeatHeightMm,
        1
      ),
      seatWidthDeltaMm: roundTo(
        evalB.footContact.effectiveSeatWidthMm - evalA.footContact.effectiveSeatWidthMm,
        1
      ),
      wheelbaseDeltaMm: bikeB.wheelbaseMm - bikeA.wheelbaseMm,
      wetWeightDeltaKg: roundTo((bikeB.wetWeightKg ?? 0) - (bikeA.wetWeightKg ?? 0), 1),
      seatedKneeAngleDeltaDeg: roundTo(
        evalB.kinematics.seated.kneeAngleDeg - evalA.kinematics.seated.kneeAngleDeg,
        1
      ),
      seatedTorsoLeanDeltaDeg: roundTo(
        evalB.kinematics.seated.torsoLeanDeg - evalA.kinematics.seated.torsoLeanDeg,
        1
      ),
      standingTorsoLeanDeltaDeg: roundTo(
        evalB.kinematics.standing.torsoLeanDeg - evalA.kinematics.standing.torsoLeanDeg,
        1
      ),
      fitScoreDelta: evalB.fitScore - evalA.fitScore,
    },
  };
}
