import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, USER_ROLES } from '@dirtfit/shared';
import {
  buildAccessoryErgoImpactFromForm,
  canAccessAdminOnlyFeature,
  canAccessAdminPortal,
  computeDashboardMetrics,
  getAllowedNextOrderStatuses,
} from '../src/lib/admin-helpers.js';
import {
  DEFAULT_CALIBRATION_ANCHORS,
  buildCalibrationPayload,
  clientPointToUv,
  computeLiveCalibrationPreview,
} from '../src/lib/calibration-helpers.js';

const KTM_GEOMETRY_FIXTURE = {
  unladenSeatHeightMm: 955,
  seatWidthMm: 165,
  wheelbaseMm: 1485,
  groundClearanceMm: 355,
  frontWheelDiameterIn: 21,
  rearWheelDiameterIn: 18,
  frontTireOuterRadiusMm: 375,
  rearTireOuterRadiusMm: 355,
  frontTravelMm: 300,
  rearTravelMm: 310,
  staticSagRearMm: 35,
  staticSagFrontMm: 28,
  targetRiderSagRatio: 0.33,
  referenceRiderWeightKg: 83,
  linkageProgressionAlpha: 0.85,
  seatFoamFirmness: 'MEDIUM',
  seatPocketXMm: 520,
  seatPocketYMm: 955,
  footpegXMm: 615,
  footpegYMm: 410,
  handlebarGripXMm: 960,
  handlebarGripYMm: 1190,
  wetWeightKg: 112,
};

describe('Phase 7 Admin RBAC, Order State Machine & Calibration Tool logic', () => {
  it('enforces Admin Portal RBAC visibility helpers accurately', () => {
    expect(canAccessAdminPortal(USER_ROLES.ADMIN)).toBe(true);
    expect(canAccessAdminPortal(USER_ROLES.SALES_STAFF)).toBe(true);
    expect(canAccessAdminPortal(USER_ROLES.CUSTOMER)).toBe(false);
    expect(canAccessAdminPortal(null)).toBe(false);

    expect(canAccessAdminOnlyFeature(USER_ROLES.ADMIN)).toBe(true);
    expect(canAccessAdminOnlyFeature(USER_ROLES.SALES_STAFF)).toBe(false);
    expect(canAccessAdminOnlyFeature(USER_ROLES.CUSTOMER)).toBe(false);
  });

  it('derives permitted Order status transitions from shared state machine without terminal transitions', () => {
    expect(getAllowedNextOrderStatuses(ORDER_STATUSES.PENDING_PAYMENT)).toContain(
      ORDER_STATUSES.DEPOSIT_PAID
    );
    expect(getAllowedNextOrderStatuses(ORDER_STATUSES.DEPOSIT_PAID)).toContain(
      ORDER_STATUSES.READY_FOR_HANDOVER
    );
    expect(getAllowedNextOrderStatuses(ORDER_STATUSES.COMPLETED)).toEqual([]);
    expect(getAllowedNextOrderStatuses(ORDER_STATUSES.CANCELLED)).toEqual([]);
  });

  it('converts DOM pointer coordinates into clamped [0..1] UV coordinates', () => {
    const uvCenter = clientPointToUv(600, 400, { left: 100, top: 100, width: 1000, height: 600 });
    expect(uvCenter).toEqual({ u: 0.5, v: 0.5 });

    const uvOutOfBounds = clientPointToUv(2500, -50, {
      left: 100,
      top: 100,
      width: 1000,
      height: 600,
    });
    expect(uvOutOfBounds).toEqual({ u: 1, v: 0 });
  });

  it('computes real-time pxPerMm, perspective error and 170cm rider overlay joints for calibrated blueprints', () => {
    // Ground V=0.87, axle span = 0.56 * 1200 = 672px -> pxPerMm = 672/1485 = 0.4525
    // Seat pocket height = 955 * 0.4525 = 432px -> seatPocket.v = (0.87*800 - 432)/800 = 0.33
    const calibratedAnchors = {
      ...DEFAULT_CALIBRATION_ANCHORS,
      seatPocket: { u: 0.39, v: 0.33 },
    };

    const payload = buildCalibrationPayload({
      facing: 'RIGHT',
      imageWidthPx: 1200,
      imageHeightPx: 800,
      anchorsUv: calibratedAnchors,
    });

    const preview = computeLiveCalibrationPreview(payload, KTM_GEOMETRY_FIXTURE);
    expect(preview.isValid).toBe(true);
    expect(preview.metrics).toBeTruthy();
    expect(preview.metrics.pxPerMm).toBeCloseTo(0.4525, 3);
    expect(preview.metrics.isPerspectiveDistorted).toBe(false);
    expect(preview.overlayJointsSvg).toBeTruthy();
    expect(preview.overlayJointsSvg.hip.x).toBeGreaterThan(0);
    expect(preview.overlayJointsSvg.footContact.y).toBeGreaterThan(0);

    // Invalid LEFT facing with RIGHT-aligned axles fails CalibrationDataSchema validation cleanly
    const invalidLeft = buildCalibrationPayload({
      facing: 'LEFT',
      imageWidthPx: 1200,
      imageHeightPx: 800,
      anchorsUv: calibratedAnchors,
    });
    const invalidPreview = computeLiveCalibrationPreview(invalidLeft, KTM_GEOMETRY_FIXTURE);
    expect(invalidPreview.isValid).toBe(false);
    expect(invalidPreview.validationErrors.length).toBeGreaterThan(0);
  });

  it('computes operational dashboard KPIs and accessory ergo impact JSON cleanly', () => {
    const metrics = computeDashboardMetrics({
      bikes: [
        { id: 'b1', status: 'ACTIVE', availableQty: 1, stockQty: 2 },
        { id: 'b2', status: 'ACTIVE', availableQty: 5, stockQty: 5 },
      ],
      orders: [
        { id: 'o1', status: 'DEPOSIT_PAID', totalVnd: 15_000_000 },
        { id: 'o2', status: 'COMPLETED', totalVnd: 200_000_000 },
      ],
      testRides: [
        { id: 't1', status: 'PENDING' },
        { id: 't2', status: 'CANCELLED' },
      ],
    });

    expect(metrics.pendingOrdersCount).toBe(1);
    expect(metrics.pendingOrdersRevenueVnd).toBe(15_000_000);
    expect(metrics.lowStockBikesCount).toBe(1);
    expect(metrics.totalAvailableBikes).toBe(6);
    expect(metrics.upcomingTestRidesCount).toBe(1);

    expect(
      buildAccessoryErgoImpactFromForm({
        loweringLinkMm: '30',
        forkDropMm: '10',
        lowSeatMm: '',
        barRiserMm: 0,
      })
    ).toEqual({ loweringLinkMm: 30, forkDropMm: 10 });
    expect(buildAccessoryErgoImpactFromForm({})).toBeNull();
  });
});
