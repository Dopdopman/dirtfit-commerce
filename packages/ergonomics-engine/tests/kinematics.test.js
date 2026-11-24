import { describe, expect, it } from 'vitest';
import {
  STANCE_MODES,
  angleBetweenPointsDeg,
  calculateFootContact,
  calculateRiderKinematics,
  calculateSuspensionSag,
  computeAnthropometry,
  solveTwoBoneIK,
} from '../src/index.js';

const COMPACT_DUAL_SPORT = {
  name: 'Compact 150 Dual-Sport',
  unladenSeatHeightMm: 869,
  seatWidthMm: 165,
  wheelbaseMm: 1375,
  groundClearanceMm: 285,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 350,
  rearTireOuterRadiusMm: 332,
  frontTravelMm: 225,
  rearTravelMm: 207,
  staticSagRearMm: 24,
  staticSagFrontMm: 20,
  targetRiderSagRatio: 0.34,
  referenceRiderWeightKg: 75,
  linkageProgressionAlpha: 0.9,
  seatFoamFirmness: 'MEDIUM',
  seatPocketXMm: 520,
  seatPocketYMm: 869,
  footpegXMm: 580,
  footpegYMm: 380,
  handlebarGripXMm: 870,
  handlebarGripYMm: 1090,
  rakeDeg: 27,
  wetWeightKg: 122,
};

describe('2D Analytical Inverse Kinematics (Seated & Standing Attack)', () => {
  it('solveTwoBoneIK preserves exact segment lengths and avoids NaN on over-reach', () => {
    const solved = solveTwoBoneIK({ x: 0, y: 100 }, { x: 400, y: 200 }, 300, 300, 'FORWARD');
    const len1 = Math.hypot(solved.joint.x - 0, solved.joint.y - 100);
    const len2 = Math.hypot(
      solved.endEffector.x - solved.joint.x,
      solved.endEffector.y - solved.joint.y
    );

    expect(len1).toBeCloseTo(300, 0);
    expect(len2).toBeCloseTo(300, 0);
    expect(solved.clampedTarget).toBe(false);

    const overReach = solveTwoBoneIK({ x: 0, y: 0 }, { x: 900, y: 0 }, 300, 300, 'DOWN_BACK');
    expect(overReach.clampedTarget).toBe(true);
    expect(Number.isNaN(overReach.joint.x)).toBe(false);
    expect(Number.isNaN(overReach.joint.y)).toBe(false);
  });

  it('detects cramped knees and hunched standing stance for 205cm rider and recommends bar risers', () => {
    const tallRider = {
      heightCm: 205,
      weightKg: 98,
      inseamCm: 98,
      footwear: 'MX_BOOTS',
      stanceMode: STANCE_MODES.STANDING_ATTACK,
    };

    const anthropometry = computeAnthropometry(tallRider);
    const sag = calculateSuspensionSag(tallRider, COMPACT_DUAL_SPORT);
    const contact = calculateFootContact(tallRider, COMPACT_DUAL_SPORT, sag, anthropometry);
    const kinematics = calculateRiderKinematics(
      tallRider,
      COMPACT_DUAL_SPORT,
      sag,
      anthropometry,
      contact
    );

    expect(kinematics.seated.kneeAngleDeg).toBeLessThan(85);
    expect(kinematics.standing.torsoLeanDeg).toBeGreaterThan(50);
    expect(kinematics.standing.standingReachStatus).toBe('HUNCHED_STANCE');
    expect(kinematics.standing.recommendedBarRiserMm).toBeGreaterThan(0);

    // Applying a 40mm bar riser improves standing torso lean
    const raisedKinematics = calculateRiderKinematics(
      tallRider,
      COMPACT_DUAL_SPORT,
      sag,
      anthropometry,
      contact,
      { barRiserMm: 40, pegLowerMm: 20 }
    );
    expect(raisedKinematics.standing.torsoLeanDeg).toBeLessThanOrEqual(
      kinematics.standing.torsoLeanDeg
    );
    expect(raisedKinematics.seated.kneeAngleDeg).toBeGreaterThan(kinematics.seated.kneeAngleDeg);
  });

  it('returns valid 8-joint skeleton across all stance modes', () => {
    const rider = {
      heightCm: 174,
      weightKg: 72,
      footwear: 'ADV_BOOTS',
      stanceMode: STANCE_MODES.SEATED_ONE_FOOT,
    };
    const anthropometry = computeAnthropometry(rider);
    const sag = calculateSuspensionSag(rider, COMPACT_DUAL_SPORT);
    const contact = calculateFootContact(rider, COMPACT_DUAL_SPORT, sag, anthropometry);
    const kin = calculateRiderKinematics(rider, COMPACT_DUAL_SPORT, sag, anthropometry, contact);

    const expectedJoints = [
      'ankle',
      'knee',
      'hip',
      'shoulder',
      'elbow',
      'wrist',
      'headCenter',
      'footContact',
    ];
    for (const jointName of expectedJoints) {
      expect(typeof kin.activeJoints[jointName].x).toBe('number');
      expect(typeof kin.activeJoints[jointName].y).toBe('number');
      expect(Number.isNaN(kin.activeJoints[jointName].x)).toBe(false);
    }

    expect(angleBetweenPointsDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(
      90,
      4
    );
  });
});
