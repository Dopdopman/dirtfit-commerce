import { describe, expect, it } from 'vitest';
import { CONTACT_STATUSES, evaluateBikeFit } from '../src/index.js';

const KTM_350_EXCF = {
  id: 'bike-ktm-350-excf',
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

const HONDA_CRF300L = {
  id: 'bike-honda-crf300l',
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

const YAMAHA_TENERE_700 = {
  id: 'bike-yamaha-t7',
  name: 'Yamaha Ténéré 700',
  unladenSeatHeightMm: 875,
  seatWidthMm: 220,
  wheelbaseMm: 1595,
  groundClearanceMm: 240,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 355,
  rearTireOuterRadiusMm: 342,
  frontTravelMm: 210,
  rearTravelMm: 200,
  staticSagRearMm: 22,
  staticSagFrontMm: 20,
  targetRiderSagRatio: 0.3,
  referenceRiderWeightKg: 85,
  linkageProgressionAlpha: 0.85,
  seatFoamFirmness: 'PLUSH',
  seatPocketXMm: 610,
  seatPocketYMm: 875,
  footpegXMm: 660,
  footpegYMm: 375,
  handlebarGripXMm: 1010,
  handlebarGripYMm: 1165,
  rakeDeg: 27,
  wetWeightKg: 204,
};

const KTM_COMPATIBLE_PARTS = [
  {
    id: 'acc-link-30',
    name: 'Zeta Lowering Link -30mm',
    category: 'LOWERING_LINK',
    priceVnd: 3_200_000,
    installLaborVnd: 450_000,
    ergoImpact: { loweringLinkMm: 30, forkDropMm: 10 },
  },
  {
    id: 'acc-low-seat-25',
    name: 'KTM PowerParts Low Seat -25mm',
    category: 'LOW_SEAT',
    priceVnd: 4_800_000,
    installLaborVnd: 0,
    ergoImpact: { lowSeatMm: 25, seatWidthReductionMm: 10 },
  },
  {
    id: 'acc-bar-riser-30',
    name: 'Rox Handlebar Riser +30mm',
    category: 'BAR_RISER',
    priceVnd: 2_100_000,
    installLaborVnd: 200_000,
    ergoImpact: { barRiserMm: 30 },
  },
  {
    id: 'acc-soft-spring',
    name: 'WP Softer Rear Shock Spring',
    category: 'SHOCK_SPRING',
    priceVnd: 5_500_000,
    installLaborVnd: 600_000,
    ergoImpact: { springRateRatio: 0.82 },
  },
];

describe('Real-World Motorcycle Benchmarks & Short Rider Lowering Combo', () => {
  it('evaluates short rider (160cm, 73cm inseam, 55kg) on KTM 350 EXC-F stock vs MX_BOOTS + Lowering Link (-30mm) + Low Seat (-25mm)', () => {
    const stockShortRider = {
      heightCm: 160,
      inseamCm: 73,
      weightKg: 55,
      footwear: 'SNEAKERS',
      ridingExperience: 'INTERMEDIATE',
      targetTerrain: 'OFF_ROAD',
    };

    const stockEval = evaluateBikeFit(stockShortRider, KTM_350_EXCF, {}, KTM_COMPATIBLE_PARTS);

    // Stock: 160cm / 73cm inseam + sneakers on 963mm KTM has 0% two-foot ground reach
    expect([CONTACT_STATUSES.ONE_FOOT_SHIFT, CONTACT_STATUSES.TOO_TALL_UNSAFE]).toContain(
      stockEval.footContact.contactStatus
    );
    expect(stockEval.footContact.footContactPercent).toBe(0);
    expect(stockEval.upsellSuggestions.length).toBeGreaterThan(0);
    expect(stockEval.upsellSuggestions.some((s) => s.type === 'LOWERING_BUNDLE')).toBe(true);

    // Now enable MX_BOOTS + Lowering Link (-30mm) + Low Seat (-25mm)
    const moddedRider = { ...stockShortRider, footwear: 'MX_BOOTS' };
    const moddedEval = evaluateBikeFit(
      moddedRider,
      KTM_350_EXCF,
      { loweringLinkMm: 30, forkDropMm: 10, lowSeatMm: 25 },
      KTM_COMPATIBLE_PARTS
    );

    // Effective seat height drops substantially (> 45mm) and one-foot reach improves decisively
    const totalSeatDropMm =
      stockEval.sag.effectiveSeatHeightMm - moddedEval.sag.effectiveSeatHeightMm;
    expect(totalSeatDropMm).toBeGreaterThanOrEqual(45);
    expect(moddedEval.footContact.heightDeficitMm).toBeLessThan(
      stockEval.footContact.heightDeficitMm
    );
    expect(moddedEval.footContact.oneFootContactPercent).toBeGreaterThan(
      stockEval.footContact.oneFootContactPercent
    );
    expect([CONTACT_STATUSES.BALLS_OF_FEET, CONTACT_STATUSES.FLAT_FOOT]).toContain(
      moddedEval.footContact.oneFootContactStatus
    );
    expect(moddedEval.fitScore).toBeGreaterThan(stockEval.fitScore);
  });

  it('matches Golden Real-World Benchmarks within ±8mm', () => {
    // 1. KTM 350 EXC-F (963mm unladen) with reference 75kg + 8kg gear rider -> ~897mm effective
    const ktmRef = evaluateBikeFit(
      { heightCm: 176, weightKg: 75, gearWeightKg: 8, footwear: 'MX_BOOTS' },
      KTM_350_EXCF
    );
    expect(Math.abs(ktmRef.sag.effectiveSeatHeightMm - 897)).toBeLessThanOrEqual(8);

    // 2. Honda CRF300L with 75kg + 7kg gear rider -> ~815mm effective (soft Dual-Sport suspension)
    const crfRef = evaluateBikeFit(
      { heightCm: 175, weightKg: 75, gearWeightKg: 7, footwear: 'ADV_BOOTS' },
      HONDA_CRF300L
    );
    expect(Math.abs(crfRef.sag.effectiveSeatHeightMm - 815)).toBeLessThanOrEqual(8);

    // 3. Yamaha Tenere 700 with 78kg + 7kg gear rider -> ~825mm effective, wide 220mm saddle
    const t7Ref = evaluateBikeFit(
      { heightCm: 176, weightKg: 78, gearWeightKg: 7, footwear: 'ADV_BOOTS' },
      YAMAHA_TENERE_700
    );
    expect(Math.abs(t7Ref.sag.effectiveSeatHeightMm - 825)).toBeLessThanOrEqual(8);
    expect(t7Ref.footContact.wrapLossMm).toBeGreaterThan(15);
  });
});
