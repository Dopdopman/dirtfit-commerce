import { describe, expect, it } from 'vitest';
import {
  SAG_STATUSES,
  SAG_THRESHOLDS,
  calculateSuspensionSag,
  clamp,
  degToRad,
  radToDeg,
  roundTo,
} from '../src/index.js';

const CRF300L = {
  name: 'Honda CRF300L',
  unladenSeatHeightMm: 880,
  seatWidthMm: 175,
  wheelbaseMm: 1455,
  groundClearanceMm: 285,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 355,
  rearTireOuterRadiusMm: 338,
  frontTravelMm: 260,
  rearTravelMm: 260,
  staticSagRearMm: 32,
  staticSagFrontMm: 24,
  targetRiderSagRatio: 0.35,
  referenceRiderWeightKg: 78,
  linkageProgressionAlpha: 0.95,
  seatFoamFirmness: 'MEDIUM',
  seatPocketXMm: 560,
  seatPocketYMm: 880,
  footpegXMm: 615,
  footpegYMm: 365,
  handlebarGripXMm: 930,
  handlebarGripYMm: 1120,
  rakeDeg: 27.5,
  wetWeightKg: 142,
};

const KTM_350_EXCF = {
  name: 'KTM 350 EXC-F',
  unladenSeatHeightMm: 963,
  seatWidthMm: 145,
  wheelbaseMm: 1489,
  groundClearanceMm: 347,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 358,
  rearTireOuterRadiusMm: 342,
  frontTravelMm: 300,
  rearTravelMm: 310,
  staticSagRearMm: 35,
  staticSagFrontMm: 26,
  targetRiderSagRatio: 0.33,
  referenceRiderWeightKg: 83,
  linkageProgressionAlpha: 0.88,
  seatFoamFirmness: 'FIRM',
  seatPocketXMm: 565,
  seatPocketYMm: 963,
  footpegXMm: 620,
  footpegYMm: 410,
  handlebarGripXMm: 955,
  handlebarGripYMm: 1175,
  rakeDeg: 26.5,
  wetWeightKg: 111,
};

describe('calculateSuspensionSag & physical clamping', () => {
  it('computes optimal sag for reference-weight rider', () => {
    const sag = calculateSuspensionSag(
      { heightCm: 175, weightKg: 75, footwear: 'ADV_BOOTS', gearWeightKg: 8 },
      KTM_350_EXCF
    );

    expect(sag.totalRiderMassKg).toBe(83);
    expect(sag.sagStatus).toBe(SAG_STATUSES.OPTIMAL);
    expect(sag.sagPercentOfTravel).toBeGreaterThanOrEqual(26);
    expect(sag.sagPercentOfTravel).toBeLessThanOrEqual(37);
    expect(sag.effectiveSeatHeightMm).toBeLessThan(KTM_350_EXCF.unladenSeatHeightMm);
  });

  it('clamps heavy rider (105kg + gear) sag strictly within physical bump-stop limit', () => {
    // Soft Dual-Sport (CRF300L, 78kg ref) under 105kg rider + 10kg MX gear = 115kg
    const softBikeSag = calculateSuspensionSag(
      { heightCm: 180, weightKg: 105, footwear: 'MX_BOOTS' },
      CRF300L
    );

    const maxAllowedSoftSag = roundTo(CRF300L.rearTravelMm * SAG_THRESHOLDS.maxClampRatio, 1);
    expect(softBikeSag.totalRearSagMm).toBeLessThanOrEqual(maxAllowedSoftSag);
    expect(softBikeSag.sagStatus).toBe(SAG_STATUSES.BOTTOMING_RISK);
    expect(softBikeSag.warnings).toContain('SUSPENSION_BOTTOMING_RISK');

    // Extreme 145kg rider on soft Dual-Sport + Enduro triggers hard physical bump-stop clamp (52%)
    const extremeSoftSag = calculateSuspensionSag(
      { heightCm: 185, weightKg: 145, footwear: 'MX_BOOTS', gearWeightKg: 12 },
      CRF300L
    );
    expect(extremeSoftSag.totalRearSagMm).toBe(maxAllowedSoftSag);
    expect(extremeSoftSag.isSagClampedMax).toBe(true);

    const extremeSag = calculateSuspensionSag(
      { heightCm: 185, weightKg: 160, footwear: 'MX_BOOTS', gearWeightKg: 20 },
      KTM_350_EXCF
    );
    expect(extremeSag.totalRearSagMm).toBe(
      roundTo(KTM_350_EXCF.rearTravelMm * SAG_THRESHOLDS.maxClampRatio, 1)
    );
    expect(extremeSag.isSagClampedMax).toBe(true);
    expect(extremeSag.effectiveSeatHeightMm).toBeGreaterThan(
      KTM_350_EXCF.rearTireOuterRadiusMm + 150
    );
  });

  it('clamps ultra-light rider (40kg) to minimum additional sag and flags TOO_STIFF', () => {
    const lightSag = calculateSuspensionSag(
      { heightCm: 152, weightKg: 40, footwear: 'SNEAKERS', gearWeightKg: 3 },
      KTM_350_EXCF
    );

    expect(lightSag.totalRearSagMm).toBeGreaterThanOrEqual(
      KTM_350_EXCF.staticSagRearMm + SAG_THRESHOLDS.minAdditionalSagMm
    );
    expect(lightSag.sagStatus).toBe(SAG_STATUSES.TOO_STIFF);
    expect(lightSag.warnings).toContain('SUSPENSION_TOO_STIFF');
  });

  it('emits FORK_DROP_RECOMMENDED and LOW_GROUND_CLEARANCE_WARNING for aggressive lowering links', () => {
    const lowClearanceBike = { ...CRF300L, groundClearanceMm: 225 };
    const sag = calculateSuspensionSag(
      { heightCm: 165, weightKg: 60, footwear: 'ADV_BOOTS' },
      lowClearanceBike,
      { loweringLinkMm: 40, forkDropMm: 0 }
    );

    expect(sag.effectiveGroundClearanceMm).toBeLessThan(200);
    expect(sag.warnings).toContain('LOW_GROUND_CLEARANCE_WARNING');
    expect(sag.warnings).toContain('FORK_DROP_RECOMMENDED');
  });

  it('utility math helpers handle NaN/bounds safely', () => {
    expect(clamp(Number.NaN, 10, 20)).toBe(10);
    expect(roundTo(radToDeg(degToRad(45)), 4)).toBe(45);
  });
});
