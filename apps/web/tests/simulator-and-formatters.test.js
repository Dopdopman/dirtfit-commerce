import { describe, expect, it, vi } from 'vitest';
import { apiRequest, clearAccessToken, getAccessToken, setAccessToken } from '@/lib/api-client';
import { formatMm, formatSignedDelta, formatVnd, getFitStatusMeta } from '@/lib/formatters';
import { buildGhostCompareScene, buildSimulatorScene } from '@/lib/simulator-helpers';

const KTM_350_GEOMETRY = {
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

const CRF_300L_GEOMETRY = {
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

describe('@dirtfit/web 2D Simulator, Ghost Overlay, Formatters & Single-Flight Refresh', () => {
  it('computes SVG 2D Simulator scene accurately for 160cm rider stock vs lowered KTM 350 EXC-F', () => {
    const stockScene = buildSimulatorScene(KTM_350_GEOMETRY, {
      heightCm: 160,
      weightKg: 55,
      inseamCm: 73,
      footwear: 'SNEAKERS',
      stanceMode: 'SEATED_BOTH_FEET',
    });

    expect(stockScene.evaluation.footContact.contactStatus).toBe('ONE_FOOT_SHIFT');
    expect(stockScene.svgWireframe.seatProfile).toHaveLength(3);
    expect(Number.isFinite(stockScene.svgJoints.hip.x)).toBe(true);
    expect(stockScene.referenceLines.effectiveSeatY).toBeGreaterThan(
      stockScene.referenceLines.unladenSeatY
    );

    const loweredScene = buildSimulatorScene(
      KTM_350_GEOMETRY,
      {
        heightCm: 160,
        weightKg: 55,
        inseamCm: 73,
        footwear: 'MX_BOOTS',
        stanceMode: 'STANDING_ATTACK',
      },
      { loweringLinkMm: 30, forkDropMm: 10, lowSeatMm: 25 }
    );

    expect(loweredScene.evaluation.fitScore).toBeGreaterThan(stockScene.evaluation.fitScore);
    expect(loweredScene.evaluation.sag.effectiveSeatHeightMm).toBeLessThan(
      stockScene.evaluation.sag.effectiveSeatHeightMm - 40
    );
    expect(loweredScene.svgJoints.hip.y).not.toBe(stockScene.svgJoints.hip.y);
  });

  it('builds Ghost Overlay comparison scene scaling Honda CRF300L and KTM 350 EXC-F in mm', () => {
    const ghostScene = buildGhostCompareScene(
      CRF_300L_GEOMETRY,
      KTM_350_GEOMETRY,
      {
        heightCm: 168,
        weightKg: 65,
        inseamCm: 76,
        footwear: 'MX_BOOTS',
      },
      { alignmentMode: 'SEAT_POCKET' }
    );

    expect(ghostScene.comparison.deltas.unladenSeatHeightDeltaMm).toBe(83);
    expect(ghostScene.bikeASvg.wireframe.rearWheel.center.x).toBeGreaterThan(0);
    expect(ghostScene.bikeBSvg.wireframe.frontWheel.center.x).toBeGreaterThan(
      ghostScene.bikeBSvg.wireframe.rearWheel.center.x
    );
  });

  it('formats VND currency, millimeter values, signed deltas, and Rider Fit badges', () => {
    expect(formatVnd(359_000_000)).toBe('359,000,000 VND');
    expect(formatVnd(359_000_000, 'vi')).toContain('359.000.000');
    expect(formatVnd(359_000_000, 'vi')).toContain('₫');
    expect(formatMm(963)).toBe('963 mm');
    expect(formatMm(null)).toBe('—');
    expect(formatSignedDelta(-55, 'mm')).toBe('-55 mm');
    expect(formatSignedDelta(8.4, '°')).toBe('+8.4 °');
    expect(getFitStatusMeta('FLAT_FOOT').tone).toBe('flat');
    expect(getFitStatusMeta('TOO_TALL_UNSAFE').tone).toBe('unsafe');
  });

  it('shares a single POST /api/v1/auth/refresh across parallel 401 responses via Single-Flight Refresh Queue', async () => {
    clearAccessToken();
    setAccessToken('expired-jwt-token');

    let refreshCallCount = 0;
    const mockFetch = vi.fn(async (url, init) => {
      if (String(url).endsWith('/api/v1/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 15));
        return new Response(
          JSON.stringify({
            data: { accessToken: 'fresh-jwt-token' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      if (init.headers.authorization === 'Bearer expired-jwt-token') {
        return new Response(
          JSON.stringify({
            code: 'TOKEN_EXPIRED',
            title: 'Access token expired',
            detail: 'Expired',
          }),
          { status: 401, headers: { 'content-type': 'application/problem+json' } }
        );
      }

      return new Response(
        JSON.stringify({
          data: { ok: true, usedToken: init.headers.authorization },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const [resA, resB] = await Promise.all([
      apiRequest('/api/v1/orders', { fetchImpl: mockFetch, baseUrl: 'http://localhost:4000' }),
      apiRequest('/api/v1/test-rides/me', {
        fetchImpl: mockFetch,
        baseUrl: 'http://localhost:4000',
      }),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(resA.usedToken).toBe('Bearer fresh-jwt-token');
    expect(resB.usedToken).toBe('Bearer fresh-jwt-token');
    expect(getAccessToken()).toBe('fresh-jwt-token');

    clearAccessToken();
  });
});
