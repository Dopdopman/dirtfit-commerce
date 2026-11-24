import { describe, expect, it } from 'vitest';
import {
  buildParametricWireframe,
  compareTwoBikes,
  computeCalibrationMetrics,
  svgToWorld,
  worldToSvg,
} from '../src/index.js';

const BIKE_A = {
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
  seatPocketXMm: 560,
  seatPocketYMm: 880,
  footpegXMm: 615,
  footpegYMm: 365,
  handlebarGripXMm: 930,
  handlebarGripYMm: 1120,
  rakeDeg: 27.5,
  wetWeightKg: 142,
};

const BIKE_B = {
  name: 'Yamaha Tenere 700',
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
  seatPocketXMm: 610,
  seatPocketYMm: 875,
  footpegXMm: 660,
  footpegYMm: 375,
  handlebarGripXMm: 1010,
  handlebarGripYMm: 1165,
  rakeDeg: 27,
  wetWeightKg: 204,
};

describe('Calibration projection, Parametric Wireframe & Ghost Overlay Comparator', () => {
  it('computes pxPerMm and detects perspective distortion accurately', () => {
    const cleanCalibration = {
      version: 1,
      facing: 'RIGHT',
      imageWidthPx: 1600,
      imageHeightPx: 1000,
      anchorsUv: {
        rearAxle: { u: 0.2, v: 0.7 },
        frontAxle: { u: 0.745625, v: 0.7 }, // 873px span -> 0.6 px/mm for 1455mm wheelbase
        groundLineV: 0.9028, // 202.8px below axle -> 338mm tire radius
        seatPocket: { u: 0.43, v: 0.3748 }, // 528px above ground -> 880mm seat height
        footpeg: { u: 0.45, v: 0.68 },
        handlebarGrip: { u: 0.64, v: 0.23 },
      },
    };

    const metrics = computeCalibrationMetrics(cleanCalibration, BIKE_A);
    expect(metrics.pxPerMm).toBeCloseTo(0.6, 2);
    expect(metrics.isPerspectiveDistorted).toBe(false);

    const distortedCalibration = {
      ...cleanCalibration,
      anchorsUv: {
        ...cleanCalibration.anchorsUv,
        seatPocket: { u: 0.43, v: 0.25 },
      },
    };
    const distortedMetrics = computeCalibrationMetrics(distortedCalibration, BIKE_A);
    expect(distortedMetrics.isPerspectiveDistorted).toBe(true);
  });

  it('round-trips worldToSvg and svgToWorld projections within 0.2mm', () => {
    const viewport = { originSvgX: 320, originSvgY: 900, pxPerMm: 0.6 };
    const original = { x: 560, y: 815 };
    const svgPt = worldToSvg(original, viewport);
    const backToWorld = svgToWorld(svgPt, viewport);

    expect(backToWorld.x).toBeCloseTo(original.x, 0);
    expect(backToWorld.y).toBeCloseTo(original.y, 0);
  });

  it('generates fallback parametric CAD wireframe when calibrationData is null', () => {
    const wireframe = buildParametricWireframe(BIKE_A);
    expect(wireframe.rearWheel.center).toEqual({ x: 0, y: BIKE_A.rearTireOuterRadiusMm });
    expect(wireframe.frontWheel.center).toEqual({
      x: BIKE_A.wheelbaseMm,
      y: BIKE_A.frontTireOuterRadiusMm,
    });
    expect(wireframe.seatProfile).toHaveLength(3);

    const sagWireframe = buildParametricWireframe(BIKE_A, {
      seatDropFromSagMm: 45,
      modSeatDropMm: 20,
      effectiveSeatHeightMm: 815,
    });
    expect(sagWireframe.seatProfile[1].y).toBe(815);
  });

  it('compares two bikes with Ghost Overlay alignment in REAR_AXLE_GROUND and SEAT_POCKET modes', () => {
    const rider = { heightCm: 175, weightKg: 76, footwear: 'ADV_BOOTS' };
    const groundCompare = compareTwoBikes(rider, BIKE_A, BIKE_B);

    expect(groundCompare.bikeB.overlayOffsetMm).toEqual({ x: 0, y: 0 });
    expect(groundCompare.deltas.wetWeightDeltaKg).toBe(62);
    expect(groundCompare.deltas.wheelbaseDeltaMm).toBe(140);

    const seatCompare = compareTwoBikes(rider, BIKE_A, BIKE_B, {
      alignmentMode: 'SEAT_POCKET',
    });
    expect(seatCompare.bikeB.overlayOffsetMm.x).toBe(BIKE_A.seatPocketXMm - BIKE_B.seatPocketXMm);
  });
});
