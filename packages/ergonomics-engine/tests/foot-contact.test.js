import { describe, expect, it } from 'vitest';
import {
  CONTACT_STATUSES,
  calculateFootContact,
  calculateSuspensionSag,
  computeAnthropometry,
  estimateInseamCm,
} from '../src/index.js';

const BASE_BIKE = {
  name: 'Test Dual-Sport',
  unladenSeatHeightMm: 875,
  seatWidthMm: 150,
  wheelbaseMm: 1470,
  groundClearanceMm: 270,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 355,
  rearTireOuterRadiusMm: 340,
  frontTravelMm: 240,
  rearTravelMm: 240,
  staticSagRearMm: 28,
  staticSagFrontMm: 22,
  targetRiderSagRatio: 0.33,
  referenceRiderWeightKg: 83,
  linkageProgressionAlpha: 0.85,
  seatFoamFirmness: 'MEDIUM',
  seatPocketXMm: 560,
  seatPocketYMm: 875,
  footpegXMm: 615,
  footpegYMm: 380,
  handlebarGripXMm: 940,
  handlebarGripYMm: 1140,
};

describe('Anthropometry & Foot Contact mechanics', () => {
  it('estimates realistic inseam when omitted and respects bodyProportion', () => {
    const shortLegs = estimateInseamCm({
      heightCm: 175,
      gender: 'MALE',
      bodyProportion: 'SHORT_LEGS',
    });
    const avgLegs = estimateInseamCm({
      heightCm: 175,
      gender: 'MALE',
      bodyProportion: 'AVERAGE',
    });
    const longLegs = estimateInseamCm({
      heightCm: 175,
      gender: 'FEMALE',
      bodyProportion: 'LONG_LEGS',
    });

    expect(shortLegs).toBeLessThan(avgLegs);
    expect(longLegs).toBeGreaterThan(avgLegs);
  });

  it('penalizes wider Adventure saddles via Seat Width Wrap Loss & lateral splay', () => {
    const rider = { heightCm: 172, weightKg: 72, inseamCm: 79, footwear: 'ADV_BOOTS' };
    const anthropometry = computeAnthropometry(rider);

    const narrowBike = { ...BASE_BIKE, seatWidthMm: 145 };
    const wideBike = { ...BASE_BIKE, seatWidthMm: 230 };

    const sagNarrow = calculateSuspensionSag(rider, narrowBike);
    const sagWide = calculateSuspensionSag(rider, wideBike);

    const contactNarrow = calculateFootContact(rider, narrowBike, sagNarrow, anthropometry);
    const contactWide = calculateFootContact(rider, wideBike, sagWide, anthropometry);

    expect(contactWide.wrapLossMm).toBeGreaterThan(contactNarrow.wrapLossMm);
    expect(contactWide.lateralFootOffsetMm).toBeGreaterThan(contactNarrow.lateralFootOffsetMm);
    expect(contactWide.heightDeficitMm).toBeGreaterThan(contactNarrow.heightDeficitMm);
  });

  it('reflects MX_BOOTS stiffer ankle cuff vs SNEAKERS flex limit', () => {
    const tallEnduro = { ...BASE_BIKE, unladenSeatHeightMm: 930, seatPocketYMm: 930 };

    const riderSneakers = { heightCm: 170, weightKg: 70, inseamCm: 78, footwear: 'SNEAKERS' };
    const riderMx = { heightCm: 170, weightKg: 70, inseamCm: 78, footwear: 'MX_BOOTS' };

    const contactSneakers = calculateFootContact(
      riderSneakers,
      tallEnduro,
      calculateSuspensionSag(riderSneakers, tallEnduro),
      computeAnthropometry(riderSneakers)
    );
    const contactMx = calculateFootContact(
      riderMx,
      tallEnduro,
      calculateSuspensionSag(riderMx, tallEnduro),
      computeAnthropometry(riderMx)
    );

    // MX boots increase available leg reach (+17mm sole vs sneakers)
    expect(contactMx.availableLegLengthMm).toBeGreaterThan(contactSneakers.availableLegLengthMm);
    // Yet ankle tip-toe angle is strictly capped tighter on MX boots (15 deg vs 35 deg)
    expect(contactMx.ankleAngleDeg).toBeLessThanOrEqual(25);
  });

  it('handles extreme short rider (145cm) on tall 960mm bike without NaN', () => {
    const rider = { heightCm: 145, weightKg: 45, footwear: 'SNEAKERS' };
    const tallBike = { ...BASE_BIKE, unladenSeatHeightMm: 960, seatPocketYMm: 960 };
    const anthropometry = computeAnthropometry(rider);
    const sag = calculateSuspensionSag(rider, tallBike);
    const contact = calculateFootContact(rider, tallBike, sag, anthropometry);

    expect(Number.isNaN(contact.flatFootReachMm)).toBe(false);
    expect(Number.isNaN(contact.footContactPercent)).toBe(false);
    expect(contact.contactStatus).toBe(CONTACT_STATUSES.TOO_TALL_UNSAFE);
    expect(contact.footContactPercent).toBe(0);
  });

  it('achieves FLAT_FOOT (100%) with relaxed knee bend for tall rider', () => {
    const rider = { heightCm: 192, weightKg: 85, inseamCm: 92, footwear: 'ADV_BOOTS' };
    const anthropometry = computeAnthropometry(rider);
    const sag = calculateSuspensionSag(rider, BASE_BIKE);
    const contact = calculateFootContact(rider, BASE_BIKE, sag, anthropometry);

    expect(contact.contactStatus).toBe(CONTACT_STATUSES.FLAT_FOOT);
    expect(contact.footContactPercent).toBe(100);
    expect(contact.kneeBendAtStopDeg).toBeLessThan(178);
  });
});
