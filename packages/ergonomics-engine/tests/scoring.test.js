import { describe, expect, it } from 'vitest';
import {
  CONTACT_STATUSES,
  SAG_STATUSES,
  STANCE_MODES,
  evaluateBikeFit,
  generateSmartUpsells,
} from '../src/index.js';

const TRAIL_BIKE = {
  id: 'bike-trail-250',
  name: 'Trail 250',
  unladenSeatHeightMm: 860,
  seatWidthMm: 155,
  wheelbaseMm: 1440,
  groundClearanceMm: 270,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 350,
  rearTireOuterRadiusMm: 335,
  frontTravelMm: 240,
  rearTravelMm: 240,
  staticSagRearMm: 28,
  staticSagFrontMm: 22,
  targetRiderSagRatio: 0.34,
  referenceRiderWeightKg: 80,
  linkageProgressionAlpha: 0.9,
  seatFoamFirmness: 'MEDIUM',
  seatPocketXMm: 540,
  seatPocketYMm: 860,
  footpegXMm: 600,
  footpegYMm: 380,
  handlebarGripXMm: 910,
  handlebarGripYMm: 1120,
  rakeDeg: 27,
  wetWeightKg: 130,
};

const PARTS = [
  {
    id: 'part-link',
    name: 'Lowering Link -30mm',
    category: 'LOWERING_LINK',
    priceVnd: 2_800_000,
    installLaborVnd: 350_000,
    ergoImpact: { loweringLinkMm: 30, forkDropMm: 10 },
  },
  {
    id: 'part-seat',
    name: 'Low Seat -20mm',
    category: 'LOW_SEAT',
    priceVnd: 3_500_000,
    installLaborVnd: 0,
    ergoImpact: { lowSeatMm: 20, seatWidthReductionMm: 10 },
  },
  {
    id: 'part-riser',
    name: 'Bar Riser +40mm',
    category: 'BAR_RISER',
    priceVnd: 1_900_000,
    installLaborVnd: 150_000,
    ergoImpact: { barRiserMm: 40, barBackOffsetMm: 10 },
  },
  {
    id: 'part-soft-spring',
    name: 'Soft Rear Spring',
    category: 'SHOCK_SPRING',
    priceVnd: 4_500_000,
    installLaborVnd: 500_000,
    ergoImpact: { springRateRatio: 0.75 },
  },
];

describe('Fit Score grades & Smart Upsell engine', () => {
  it('evaluates EXCELLENT/GOOD/MANAGEABLE/CHALLENGING/UNSUITABLE across profiles', () => {
    const beginnerFlat = evaluateBikeFit(
      {
        heightCm: 184,
        weightKg: 76,
        inseamCm: 86,
        footwear: 'ADV_BOOTS',
        ridingExperience: 'BEGINNER',
        targetTerrain: 'ON_ROAD',
        stanceMode: STANCE_MODES.SEATED_RIDING,
      },
      TRAIL_BIKE
    );
    expect(beginnerFlat.footContact.contactStatus).toBe(CONTACT_STATUSES.FLAT_FOOT);
    expect(['EXCELLENT', 'GOOD']).toContain(beginnerFlat.fitGrade);

    const ballsOfFeetEval = evaluateBikeFit(
      {
        heightCm: 170,
        weightKg: 72,
        inseamCm: 77,
        footwear: 'ADV_BOOTS',
        ridingExperience: 'INTERMEDIATE',
        targetTerrain: 'DUAL_SPORT',
      },
      TRAIL_BIKE
    );
    expect(ballsOfFeetEval.footContact.contactStatus).toBe(CONTACT_STATUSES.BALLS_OF_FEET);

    const tipToeEval = evaluateBikeFit(
      {
        heightCm: 165,
        weightKg: 65,
        inseamCm: 74,
        footwear: 'SNEAKERS',
        ridingExperience: 'BEGINNER',
        targetTerrain: 'ON_ROAD',
      },
      { ...TRAIL_BIKE, unladenSeatHeightMm: 910, seatPocketYMm: 910 }
    );
    expect(tipToeEval.footContact.contactStatus).toBe(CONTACT_STATUSES.TIP_TOE);

    const expertOneFoot = evaluateBikeFit(
      {
        heightCm: 162,
        weightKg: 65,
        inseamCm: 73,
        footwear: 'MX_BOOTS',
        ridingExperience: 'EXPERT',
        targetTerrain: 'OFF_ROAD',
      },
      { ...TRAIL_BIKE, unladenSeatHeightMm: 940, seatPocketYMm: 940 }
    );
    expect(expertOneFoot.footContact.contactStatus).toBe(CONTACT_STATUSES.ONE_FOOT_SHIFT);
    expect(expertOneFoot.fitScore).toBeGreaterThanOrEqual(50);

    const unsuitable = evaluateBikeFit(
      {
        heightCm: 145,
        weightKg: 45,
        footwear: 'SNEAKERS',
        ridingExperience: 'BEGINNER',
        targetTerrain: 'ON_ROAD',
      },
      { ...TRAIL_BIKE, unladenSeatHeightMm: 980, seatPocketYMm: 980 }
    );
    expect(unsuitable.footContact.contactStatus).toBe(CONTACT_STATUSES.TOO_TALL_UNSAFE);
    expect(unsuitable.footContact.oneFootContactStatus).toBe(CONTACT_STATUSES.TOO_TALL_UNSAFE);
    expect(['UNSUITABLE', 'CHALLENGING']).toContain(unsuitable.fitGrade);
  });

  it('triggers BAR_RISER upsell for hunched standing rider and SHOCK_SPRING upsell for stiff/soft mismatches', () => {
    // 205cm rider hunches on low-bar setup -> triggers BAR_RISER suggestion
    const tallStandingEval = evaluateBikeFit(
      {
        heightCm: 205,
        weightKg: 82,
        inseamCm: 98,
        footwear: 'MX_BOOTS',
        ridingExperience: 'EXPERT',
        targetTerrain: 'OFF_ROAD',
        stanceMode: STANCE_MODES.STANDING_ATTACK,
      },
      { ...TRAIL_BIKE, handlebarGripXMm: 1000, handlebarGripYMm: 1020 },
      {},
      PARTS
    );
    expect(tallStandingEval.upsellSuggestions.some((s) => s.type === 'BAR_RISER')).toBe(true);

    // 160cm rider on tall bars yields BALANCED_ATTACK standing status
    const uprightEval = evaluateBikeFit(
      {
        heightCm: 160,
        weightKg: 65,
        footwear: 'ADV_BOOTS',
        stanceMode: STANCE_MODES.STANDING_ATTACK,
      },
      { ...TRAIL_BIKE, handlebarGripXMm: 780, handlebarGripYMm: 1320 }
    );
    expect(uprightEval.kinematics.standing.standingReachStatus).toBe('BALANCED_ATTACK');

    // One-foot shift yields TIP_TOE when seat is 995mm for 160cm sneakers rider
    const oneFootTipToe = evaluateBikeFit(
      {
        heightCm: 160,
        inseamCm: 73,
        weightKg: 58,
        footwear: 'SNEAKERS',
      },
      { ...TRAIL_BIKE, unladenSeatHeightMm: 995, seatPocketYMm: 995 },
      {},
      PARTS
    );
    expect(oneFootTipToe.footContact.oneFootContactStatus).toBe(CONTACT_STATUSES.TIP_TOE);

    // Forward-pegged cruiser geometry tests kneeAngleDeg > 115 branch
    const openKneeBike = evaluateBikeFit(
      {
        heightCm: 165,
        inseamCm: 76,
        weightKg: 72,
        footwear: 'ADV_BOOTS',
      },
      {
        ...TRAIL_BIKE,
        unladenSeatHeightMm: 920,
        seatPocketYMm: 920,
        footpegXMm: 780,
        footpegYMm: 220,
      },
      { pegLowerMm: 20 }
    );
    expect(openKneeBike.kinematics.seated.kneeAngleDeg).toBeGreaterThan(115);

    // 40kg rider on stiff bike triggers TOO_STIFF + SHOCK_SPRING suggestion
    const lightEval = evaluateBikeFit(
      {
        heightCm: 162,
        weightKg: 40,
        gearWeightKg: 3,
        footwear: 'SNEAKERS',
        ridingExperience: 'INTERMEDIATE',
        targetTerrain: 'OFF_ROAD',
      },
      TRAIL_BIKE,
      {},
      PARTS
    );
    expect(lightEval.sag.sagStatus).toBe(SAG_STATUSES.TOO_STIFF);
    expect(lightEval.upsellSuggestions.some((s) => s.type === 'SHOCK_SPRING')).toBe(true);

    // Soft sag & over-reach bike checks
    const overReachBike = {
      ...TRAIL_BIKE,
      handlebarGripXMm: 1280,
      handlebarGripYMm: 980,
      footpegYMm: 260,
    };
    const stretchedEval = evaluateBikeFit(
      { heightCm: 158, weightKg: 98, footwear: 'ADV_BOOTS' },
      overReachBike,
      { pegLowerMm: 10 },
      PARTS
    );
    expect(stretchedEval.sag.sagStatus).toBe(SAG_STATUSES.SOFT);
    expect(stretchedEval.warnings).toContain('OVER_REACH');
  });

  it('handles empty compatibleAccessories list cleanly', () => {
    const res = generateSmartUpsells({}, TRAIL_BIKE, {}, {}, []);
    expect(res).toEqual([]);
  });
});
