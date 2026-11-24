import {
  FOOTWEAR_PROFILES,
  STANCE_MODES,
  clamp,
  degToRad,
  radToDeg,
  roundTo,
} from './constants.js';
import { normalizeModifications } from './sag.js';

/** @typedef {import('./types.js').Point2D} Point2D */
/** @typedef {import('./types.js').RiderProfileInput} RiderProfileInput */
/** @typedef {import('./types.js').BikeGeometryInput} BikeGeometryInput */
/** @typedef {import('./types.js').SagResult} SagResult */
/** @typedef {import('./types.js').AnthropometryResult} AnthropometryResult */
/** @typedef {import('./types.js').BikeModificationsInput} BikeModificationsInput */
/** @typedef {import('./types.js').KinematicsStanceResult} KinematicsStanceResult */

/**
 * Compute interior angle (0..180 deg) at vertex B formed by segments BA and BC.
 * @param {Point2D} a
 * @param {Point2D} b
 * @param {Point2D} c
 * @returns {number}
 */
export function angleBetweenPointsDeg(a, b, c) {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const magProduct = Math.hypot(bax, bay) * Math.hypot(bcx, bcy);
  if (magProduct <= 1e-6) {
    return 180;
  }
  const cosTheta = clamp((bax * bcx + bay * bcy) / magProduct, -1, 1);
  return radToDeg(Math.acos(cosTheta));
}

/**
 * Solve 2-bone analytical inverse kinematics in 2D using Law of Cosines.
 * Guarantees valid coordinates without NaN even when target slightly exceeds reach.
 * @param {Point2D} origin
 * @param {Point2D} target
 * @param {number} len1
 * @param {number} len2
 * @param {'FORWARD'|'DOWN_BACK'|'UP_BACK'} [bendDirection]
 * @returns {{ joint: Point2D, endEffector: Point2D, clampedTarget: boolean }}
 */
export function solveTwoBoneIK(origin, target, len1, len2, bendDirection = 'FORWARD') {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const rawDist = Math.hypot(dx, dy);
  const minReach = Math.abs(len1 - len2) + 1e-3;
  const maxReach = (len1 + len2) * 0.995;
  const dist = clamp(rawDist, minReach, maxReach);
  const clampedTarget = rawDist > maxReach || rawDist < minReach;

  const baseAngle = rawDist > 1e-6 ? Math.atan2(dy, dx) : 0;
  const cosOffset = clamp((len1 ** 2 + dist ** 2 - len2 ** 2) / (2 * len1 * dist), -1, 1);
  const offsetAngle = Math.acos(cosOffset);

  const candidateA = {
    x: origin.x + len1 * Math.cos(baseAngle + offsetAngle),
    y: origin.y + len1 * Math.sin(baseAngle + offsetAngle),
  };
  const candidateB = {
    x: origin.x + len1 * Math.cos(baseAngle - offsetAngle),
    y: origin.y + len1 * Math.sin(baseAngle - offsetAngle),
  };

  let joint = candidateA;
  if (bendDirection === 'FORWARD') {
    joint = candidateA.x >= candidateB.x ? candidateA : candidateB;
  } else if (bendDirection === 'DOWN_BACK') {
    joint = candidateA.y <= candidateB.y ? candidateA : candidateB;
  } else if (bendDirection === 'UP_BACK') {
    joint = candidateA.y >= candidateB.y ? candidateA : candidateB;
  }

  const endEffector = clampedTarget
    ? {
        x: origin.x + dist * Math.cos(baseAngle),
        y: origin.y + dist * Math.sin(baseAngle),
      }
    : { x: target.x, y: target.y };

  return {
    joint: { x: roundTo(joint.x, 1), y: roundTo(joint.y, 1) },
    endEffector: { x: roundTo(endEffector.x, 1), y: roundTo(endEffector.y, 1) },
    clampedTarget,
  };
}

/**
 * Solve shoulder position on hip arc for desired torso lean angle (deg from vertical +Y toward +X).
 * @param {Point2D} hip
 * @param {number} torsoLenMm
 * @param {number} leanDeg
 * @returns {Point2D}
 */
function shoulderFromLean(hip, torsoLenMm, leanDeg) {
  const rad = degToRad(leanDeg);
  return {
    x: hip.x + torsoLenMm * Math.sin(rad),
    y: hip.y + torsoLenMm * Math.cos(rad),
  };
}

/**
 * Calculate seated cruising Rider Triangle and joint positions.
 * @param {BikeGeometryInput} bike
 * @param {SagResult} sagResult
 * @param {AnthropometryResult} anthropometry
 * @param {object} footwearProfile
 * @param {Required<BikeModificationsInput>} safeMods
 * @returns {KinematicsStanceResult}
 */
export function calculateSeatedKinematics(
  bike,
  sagResult,
  anthropometry,
  footwearProfile,
  safeMods
) {
  const hip = {
    x: roundTo(bike.seatPocketXMm - 35, 1),
    y: roundTo(sagResult.effectiveSeatHeightMm + 82, 1),
  };
  const ankle = {
    x: roundTo(bike.footpegXMm, 1),
    y: roundTo(bike.footpegYMm - safeMods.pegLowerMm + footwearProfile.soleThicknessMm + 20, 1),
  };

  const legIk = solveTwoBoneIK(
    hip,
    ankle,
    anthropometry.thighLenMm,
    anthropometry.shinLenMm,
    'FORWARD'
  );

  const wristTarget = {
    x: roundTo(bike.handlebarGripXMm - safeMods.barBackOffsetMm, 1),
    y: roundTo(bike.handlebarGripYMm + safeMods.barRiserMm, 1),
  };

  const totalArmReach = anthropometry.upperArmLenMm + anthropometry.forearmPlusHandMm;
  const targetArmReach = 0.88 * totalArmReach;

  let torsoLeanDeg = 6;
  let shoulder = shoulderFromLean(hip, anthropometry.torsoLenMm, torsoLeanDeg);
  let armDist = Math.hypot(wristTarget.x - shoulder.x, wristTarget.y - shoulder.y);

  // Lean torso forward gradually if bars sit farther than comfortable 88% arm reach
  while (armDist > targetArmReach && torsoLeanDeg < 55) {
    torsoLeanDeg += 1;
    shoulder = shoulderFromLean(hip, anthropometry.torsoLenMm, torsoLeanDeg);
    armDist = Math.hypot(wristTarget.x - shoulder.x, wristTarget.y - shoulder.y);
  }

  const armIk = solveTwoBoneIK(
    shoulder,
    wristTarget,
    anthropometry.upperArmLenMm,
    anthropometry.forearmPlusHandMm,
    'DOWN_BACK'
  );

  const kneeAngleDeg = angleBetweenPointsDeg(hip, legIk.joint, legIk.endEffector);
  const hipAngleDeg = angleBetweenPointsDeg(shoulder, hip, legIk.joint);
  const elbowAngleDeg = angleBetweenPointsDeg(shoulder, armIk.joint, armIk.endEffector);

  const headCenter = {
    x: roundTo(shoulder.x + 145 * Math.sin(degToRad(torsoLeanDeg * 0.6)), 1),
    y: roundTo(shoulder.y + 155, 1),
  };
  const footContact = {
    x: roundTo(legIk.endEffector.x + anthropometry.ankleToBallMm * 0.45, 1),
    y: roundTo(bike.footpegYMm - safeMods.pegLowerMm, 1),
  };

  const warnings = [];
  if (kneeAngleDeg < 72) {
    warnings.push('CRAMPED_KNEES');
  }
  if (torsoLeanDeg > 40) {
    warnings.push('OVER_REACH');
  }

  return {
    joints: {
      ankle: legIk.endEffector,
      knee: legIk.joint,
      hip,
      shoulder: { x: roundTo(shoulder.x, 1), y: roundTo(shoulder.y, 1) },
      elbow: armIk.joint,
      wrist: armIk.endEffector,
      headCenter,
      footContact,
    },
    kneeAngleDeg: roundTo(kneeAngleDeg, 1),
    hipAngleDeg: roundTo(hipAngleDeg, 1),
    torsoLeanDeg: roundTo(torsoLeanDeg, 1),
    elbowAngleDeg: roundTo(elbowAngleDeg, 1),
    warnings,
  };
}

/**
 * Solve standing Off-Road Attack torso lean for a given handlebar riser height.
 * @param {Point2D} hip
 * @param {Point2D} wristTarget
 * @param {AnthropometryResult} anthropometry
 * @returns {{ torsoLeanDeg: number, shoulder: Point2D, armIk: { joint: Point2D, endEffector: Point2D } }}
 */
function solveStandingTorso(hip, wristTarget, anthropometry) {
  const totalArmReach = anthropometry.upperArmLenMm + anthropometry.forearmPlusHandMm;
  const preferredArmReach = 0.87 * totalArmReach;

  let torsoLeanDeg = 25;
  let shoulder = shoulderFromLean(hip, anthropometry.torsoLenMm, torsoLeanDeg);
  let armDist = Math.hypot(wristTarget.x - shoulder.x, wristTarget.y - shoulder.y);

  while (armDist > preferredArmReach && torsoLeanDeg < 75) {
    torsoLeanDeg += 1;
    shoulder = shoulderFromLean(hip, anthropometry.torsoLenMm, torsoLeanDeg);
    armDist = Math.hypot(wristTarget.x - shoulder.x, wristTarget.y - shoulder.y);
  }

  const armIk = solveTwoBoneIK(
    shoulder,
    wristTarget,
    anthropometry.upperArmLenMm,
    anthropometry.forearmPlusHandMm,
    'UP_BACK'
  );

  return { torsoLeanDeg, shoulder, armIk };
}

/**
 * Calculate Standing Off-Road Attack Position ergonomics and bar-riser recommendation.
 * @param {BikeGeometryInput} bike
 * @param {AnthropometryResult} anthropometry
 * @param {object} footwearProfile
 * @param {Required<BikeModificationsInput>} safeMods
 * @returns {KinematicsStanceResult & { standingReachStatus: string, recommendedBarRiserMm: number }}
 */
export function calculateStandingKinematics(bike, anthropometry, footwearProfile, safeMods) {
  const ankle = {
    x: roundTo(bike.footpegXMm, 1),
    y: roundTo(bike.footpegYMm - safeMods.pegLowerMm + footwearProfile.soleThicknessMm + 25, 1),
  };

  // Athletic standing attack bend: shin tilted 8 deg forward, 152 deg knee flexion
  const shinAngleRad = degToRad(82);
  const knee = {
    x: roundTo(ankle.x + anthropometry.shinLenMm * Math.cos(shinAngleRad), 1),
    y: roundTo(ankle.y + anthropometry.shinLenMm * Math.sin(shinAngleRad), 1),
  };

  const thighAngleRad = degToRad(110);
  const hip = {
    x: roundTo(knee.x + anthropometry.thighLenMm * Math.cos(thighAngleRad), 1),
    y: roundTo(knee.y + anthropometry.thighLenMm * Math.sin(thighAngleRad), 1),
  };

  const wristTarget = {
    x: roundTo(bike.handlebarGripXMm - safeMods.barBackOffsetMm, 1),
    y: roundTo(bike.handlebarGripYMm + safeMods.barRiserMm, 1),
  };

  const solved = solveStandingTorso(hip, wristTarget, anthropometry);
  const kneeAngleDeg = angleBetweenPointsDeg(hip, knee, ankle);
  const hipAngleDeg = angleBetweenPointsDeg(solved.shoulder, hip, knee);
  const elbowAngleDeg = angleBetweenPointsDeg(
    solved.shoulder,
    solved.armIk.joint,
    solved.armIk.endEffector
  );

  let standingReachStatus = 'BALANCED_ATTACK';
  let recommendedBarRiserMm = 0;
  const warnings = [];

  if (solved.torsoLeanDeg > 50) {
    standingReachStatus = 'HUNCHED_STANCE';
    warnings.push('HUNCHED_STANDING_STANCE');
    for (const candidateRiser of [20, 30, 40]) {
      const testWrist = {
        x: wristTarget.x,
        y: bike.handlebarGripYMm + safeMods.barRiserMm + candidateRiser,
      };
      const testSolved = solveStandingTorso(hip, testWrist, anthropometry);
      recommendedBarRiserMm = candidateRiser;
      if (testSolved.torsoLeanDeg <= 45) {
        break;
      }
    }
  }

  const headCenter = {
    x: roundTo(solved.shoulder.x + 150 * Math.sin(degToRad(solved.torsoLeanDeg * 0.7)), 1),
    y: roundTo(solved.shoulder.y + 145, 1),
  };
  const footContact = {
    x: roundTo(ankle.x + anthropometry.ankleToBallMm * 0.3, 1),
    y: roundTo(bike.footpegYMm - safeMods.pegLowerMm, 1),
  };

  return {
    joints: {
      ankle,
      knee,
      hip,
      shoulder: { x: roundTo(solved.shoulder.x, 1), y: roundTo(solved.shoulder.y, 1) },
      elbow: solved.armIk.joint,
      wrist: solved.armIk.endEffector,
      headCenter,
      footContact,
    },
    kneeAngleDeg: roundTo(kneeAngleDeg, 1),
    hipAngleDeg: roundTo(hipAngleDeg, 1),
    torsoLeanDeg: roundTo(solved.torsoLeanDeg, 1),
    elbowAngleDeg: roundTo(elbowAngleDeg, 1),
    standingReachStatus,
    recommendedBarRiserMm,
    warnings,
  };
}

/**
 * Calculate stopped-on-ground rider joint posture (for 2D Simulator stop visualization).
 * @param {BikeGeometryInput} bike
 * @param {SagResult} sagResult
 * @param {AnthropometryResult} anthropometry
 * @param {object} footContact
 * @param {Required<BikeModificationsInput>} safeMods
 * @param {boolean} isOneFootShift
 * @returns {object}
 */
function calculateStoppedJoints(
  bike,
  sagResult,
  anthropometry,
  footContact,
  safeMods,
  isOneFootShift
) {
  const hipDropForOneFoot = isOneFootShift ? 65 : 0;
  const hip = {
    x: roundTo(bike.seatPocketXMm - 25, 1),
    y: roundTo(sagResult.effectiveSeatHeightMm + 82 - hipDropForOneFoot, 1),
  };

  const ankleBaseY = Math.max(
    anthropometry.ankleHeightMm,
    anthropometry.ankleHeightMm + Math.max(0, footContact.heightDeficitMm)
  );
  const ankle = {
    x: roundTo(hip.x + 25, 1),
    y: roundTo(
      clamp(ankleBaseY, anthropometry.ankleHeightMm, hip.y - anthropometry.thighLenMm * 0.25),
      1
    ),
  };

  const legIk = solveTwoBoneIK(
    hip,
    ankle,
    anthropometry.thighLenMm,
    anthropometry.shinLenMm,
    'FORWARD'
  );

  const wristTarget = {
    x: roundTo(bike.handlebarGripXMm - safeMods.barBackOffsetMm, 1),
    y: roundTo(bike.handlebarGripYMm + safeMods.barRiserMm, 1),
  };
  const shoulder = shoulderFromLean(hip, anthropometry.torsoLenMm, 10);
  const armIk = solveTwoBoneIK(
    shoulder,
    wristTarget,
    anthropometry.upperArmLenMm,
    anthropometry.forearmPlusHandMm,
    'DOWN_BACK'
  );

  return {
    ankle: legIk.endEffector,
    knee: legIk.joint,
    hip,
    shoulder: { x: roundTo(shoulder.x, 1), y: roundTo(shoulder.y, 1) },
    elbow: armIk.joint,
    wrist: armIk.endEffector,
    headCenter: { x: roundTo(shoulder.x + 20, 1), y: roundTo(shoulder.y + 160, 1) },
    footContact: {
      x: roundTo(legIk.endEffector.x + anthropometry.ankleToBallMm * 0.65, 1),
      y: roundTo(Math.max(0, footContact.heightDeficitMm > 0 ? 0 : 0), 1),
    },
  };
}

/**
 * Compute full kinematics across seated, standing attack, and active display stance.
 * @param {RiderProfileInput} rider
 * @param {BikeGeometryInput} bike
 * @param {SagResult} sagResult
 * @param {AnthropometryResult} anthropometry
 * @param {object} footContact
 * @param {BikeModificationsInput} [mods]
 * @returns {object}
 */
export function calculateRiderKinematics(
  rider,
  bike,
  sagResult,
  anthropometry,
  footContact,
  mods = {}
) {
  const safeMods = normalizeModifications(mods);
  const footwearProfile =
    FOOTWEAR_PROFILES[rider.footwear ?? 'ADV_BOOTS'] ?? FOOTWEAR_PROFILES.ADV_BOOTS;

  const seated = calculateSeatedKinematics(
    bike,
    sagResult,
    anthropometry,
    footwearProfile,
    safeMods
  );
  const standing = calculateStandingKinematics(bike, anthropometry, footwearProfile, safeMods);
  const activeStance = rider.stanceMode ?? STANCE_MODES.SEATED_BOTH_FEET;

  let activeJoints = seated.joints;
  if (activeStance === STANCE_MODES.STANDING_ATTACK) {
    activeJoints = standing.joints;
  } else if (
    activeStance === STANCE_MODES.SEATED_BOTH_FEET ||
    activeStance === STANCE_MODES.SEATED_ONE_FOOT
  ) {
    activeJoints = calculateStoppedJoints(
      bike,
      sagResult,
      anthropometry,
      footContact,
      safeMods,
      activeStance === STANCE_MODES.SEATED_ONE_FOOT
    );
  }

  return {
    activeStance,
    activeJoints,
    seated,
    standing,
  };
}
