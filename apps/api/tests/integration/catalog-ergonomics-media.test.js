import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
]);

const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const SPOOFED_SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>',
  'utf8'
);

const SPOOFED_HTML_BYTES = Buffer.from(
  '<!DOCTYPE html><html><body><script>alert(1)</script></body></html>',
  'utf8'
);

describe('Phase 4 Catalog, Smart Rider-Fit, Ergonomics API, Cache Invalidation & Media Security', () => {
  let app;
  let adminToken;
  let salesToken;
  let customerToken;
  let adminUser;
  let customerUser;
  let hondaBrand;

  const runId = crypto.randomUUID().slice(0, 8);
  const createdBikeIds = [];
  const createdAccessoryIds = [];
  const createdOrderIds = [];
  const createdMediaIds = [];
  const createdAuditEntityIds = [];

  /**
   * Authenticate with seeded credentials and return Bearer token + user payload.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ token: string, user: object }>}
   */
  async function loginAs(email, password) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return { token: body.data.accessToken, user: body.data.user };
  }

  beforeAll(async () => {
    app = await buildApp({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: true,
        STORAGE_DRIVER: 'local',
        RATE_LIMIT_GLOBAL_MAX: 500,
        RATE_LIMIT_AUTH_MAX: 50,
      },
      rateLimitNamespace: `df:rl:phase4-e2e:${runId}:`,
    });

    const [adminAuth, salesAuth, customerAuth, brandRow] = await Promise.all([
      loginAs('admin@dirtfit.vn', 'Admin@DirtFit2026!'),
      loginAs('sales@dirtfit.vn', 'Sales@DirtFit2026!'),
      loginAs('rider@dirtfit.vn', 'Rider@DirtFit2026!'),
      app.prisma.brand.findUnique({ where: { slug: 'honda' } }),
    ]);

    adminToken = adminAuth.token;
    adminUser = adminAuth.user;
    salesToken = salesAuth.token;
    customerToken = customerAuth.token;
    customerUser = customerAuth.user;
    hondaBrand = brandRow;

    expect(hondaBrand).toBeTruthy();
  });

  afterAll(async () => {
    if (!app) {
      return;
    }

    try {
      if (createdOrderIds.length > 0) {
        await app.prisma.inventoryReservation.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await app.prisma.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      if (createdMediaIds.length > 0) {
        await app.prisma.bikeMedia.deleteMany({
          where: { id: { in: createdMediaIds } },
        });
      }

      if (createdAccessoryIds.length > 0) {
        await app.prisma.accessory.deleteMany({
          where: { id: { in: createdAccessoryIds } },
        });
      }

      if (createdBikeIds.length > 0) {
        await app.prisma.bike.deleteMany({
          where: { id: { in: createdBikeIds } },
        });
      }

      const auditTargets = [
        ...createdAuditEntityIds,
        ...createdBikeIds,
        ...createdAccessoryIds,
        ...createdMediaIds,
      ];
      if (auditTargets.length > 0) {
        await app.prisma.auditLog.deleteMany({
          where: { entityId: { in: auditTargets } },
        });
      }

      // Ensure test keys don't linger in Redis catalog cache
      let cursor = '0';
      do {
        const [nextCursor, keys] = await app.redis.scan(
          cursor,
          'MATCH',
          'df:catalog:*',
          'COUNT',
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await app.redis.del(...keys);
        }
      } while (cursor !== '0');
    } finally {
      await app.close();
    }
  });

  it('serves Public Catalog with category/Smart Rider-Fit filters, JSON-safe Number VND, soft-delete exclusion & Lazy Expiration', async () => {
    const brandsRes = await app.inject({ method: 'GET', url: '/api/v1/brands' });
    expect(brandsRes.statusCode).toBe(200);
    expect(brandsRes.json().data.brands.length).toBeGreaterThanOrEqual(5);

    const enduroRes = await app.inject({
      method: 'GET',
      url: '/api/v1/bikes?category=ENDURO',
    });
    expect(enduroRes.statusCode).toBe(200);
    const enduroBikes = enduroRes.json().data;
    expect(enduroBikes.length).toBeGreaterThanOrEqual(2);
    for (const bike of enduroBikes) {
      expect(bike.category).toBe('ENDURO');
      expect(typeof bike.priceVnd).toBe('number');
      expect(typeof bike.depositAmountVnd).toBe('number');
      expect(bike.deletedAt).toBeNull();
    }

    // Smart Rider-Fit query with alias parameter names + L1/L2 cached geometry
    const t0 = performance.now();
    const fitRes = await app.inject({
      method: 'GET',
      url: '/api/v1/bikes?heightCm=168&weightKg=65&inseamCm=76&bootType=MX_BOOTS&includeModdable=true',
    });
    const elapsedMs = performance.now() - t0;

    expect(fitRes.statusCode).toBe(200);
    const fitBikes = fitRes.json().data;
    expect(fitBikes.length).toBeGreaterThanOrEqual(8);
    expect(elapsedMs).toBeLessThan(1000);

    for (let i = 1; i < fitBikes.length; i += 1) {
      const prevBest = Math.max(
        fitBikes[i - 1].fitPreview.fitScore,
        fitBikes[i - 1].fitPreview.bestModdedFitScore
      );
      const currBest = Math.max(
        fitBikes[i].fitPreview.fitScore,
        fitBikes[i].fitPreview.bestModdedFitScore
      );
      expect(prevBest).toBeGreaterThanOrEqual(currBest);
    }

    // Verify Lazy Expiration on live reservations and soft-delete exclusion
    const tempSlug = `temp-lazy-exp-${runId}`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/bikes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        brandId: hondaBrand.id,
        sku: `TMP-LAZY-${runId}`,
        name: `Temp Lazy Exp Bike ${runId}`,
        slug: tempSlug,
        modelYear: 2026,
        category: 'DUAL_SPORT',
        ridingFocus: 'ON_OFF_MIXED',
        engineCc: 250,
        streetLegal: true,
        priceVnd: 120_000_000,
        depositAmountVnd: 10_000_000,
        stockQty: 3,
        status: 'ACTIVE',
        geometrySpec: {
          unladenSeatHeightMm: 875,
          seatWidthMm: 165,
          wheelbaseMm: 1410,
          groundClearanceMm: 270,
          frontWheelDiameterIn: 21,
          rearWheelDiameterIn: 18,
          frontTireOuterRadiusMm: 350,
          rearTireOuterRadiusMm: 334,
          frontTravelMm: 240,
          rearTravelMm: 240,
          staticSagRearMm: 25,
          staticSagFrontMm: 20,
          seatPocketXMm: 540,
          seatPocketYMm: 875,
          footpegXMm: 600,
          footpegYMm: 375,
          handlebarGripXMm: 900,
          handlebarGripYMm: 1110,
          wetWeightKg: 135,
        },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdBike = createRes.json().data.bike;
    createdBikeIds.push(createdBike.id);
    createdAuditEntityIds.push(createdBike.id);

    const tempOrder = await app.prisma.order.create({
      data: {
        orderNumber: `DF-TMP-${runId}`,
        userId: customerUser.id,
        orderType: 'BIKE_DEPOSIT',
        status: 'PENDING_PAYMENT',
        paymentMethod: 'MOCK',
        subtotalVnd: 120_000_000n,
        totalVnd: 120_000_000n,
        payableNowVnd: 10_000_000n,
        remainingBalanceVnd: 110_000_000n,
        shippingAddressJson: { city: 'HCM' },
      },
    });
    createdOrderIds.push(tempOrder.id);

    await app.prisma.inventoryReservation.createMany({
      data: [
        {
          orderId: tempOrder.id,
          itemType: 'BIKE',
          bikeId: createdBike.id,
          quantity: 1,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 10 * 60_000), // active future hold
        },
        {
          orderId: tempOrder.id,
          itemType: 'BIKE',
          bikeId: createdBike.id,
          quantity: 1,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() - 5 * 60_000), // expired hold -> ignored by Lazy Expiration
        },
      ],
    });

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/bikes/${tempSlug}`,
    });
    expect(detailRes.statusCode).toBe(200);
    const bikeDetail = detailRes.json().data.bike;
    expect(bikeDetail.stockQty).toBe(3);
    expect(bikeDetail.activeReservedQty).toBe(1);
    expect(bikeDetail.availableQty).toBe(2);

    // Soft delete temp bike and ensure excluded from public list and detail
    const softDelRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/bikes/${createdBike.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(softDelRes.statusCode).toBe(200);

    const hiddenDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/bikes/${tempSlug}`,
    });
    expect(hiddenDetailRes.statusCode).toBe(404);

    // Public accessories endpoint
    const accRes = await app.inject({ method: 'GET', url: '/api/v1/accessories?inStock=true' });
    expect(accRes.statusCode).toBe(200);
    const accList = accRes.json().data;
    expect(accList.length).toBeGreaterThanOrEqual(8);
    expect(typeof accList[0].priceVnd).toBe('number');
    expect(accList[0].availableQty).toBeGreaterThan(0);

    const accDetailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/accessories/${accList[0].slug}`,
    });
    expect(accDetailRes.statusCode).toBe(200);
    expect(typeof accDetailRes.json().data.accessory.priceVnd).toBe('number');
  });

  it('simulates 160cm rider on KTM 350 EXC-F with DB smart upsells and compares two bikes for Ghost Overlay', async () => {
    const stockSimRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ergonomics/simulate',
      payload: {
        slug: 'ktm-350-exc-f',
        heightCm: 160,
        weightKg: 55,
        inseamCm: 73,
        bootType: 'SNEAKERS',
      },
    });
    expect(stockSimRes.statusCode).toBe(200);
    const stockSim = stockSimRes.json().data;

    expect(stockSim.bike.slug).toBe('ktm-350-exc-f');
    expect(typeof stockSim.bike.priceVnd).toBe('number');
    expect(stockSim.footContact.contactStatus).toBe('ONE_FOOT_SHIFT');
    expect(stockSim.upsellSuggestions.length).toBeGreaterThan(0);
    expect(stockSim.upsellSuggestions[0].accessories.length).toBeGreaterThan(0);
    expect(typeof stockSim.upsellSuggestions[0].accessories[0].priceVnd).toBe('number');
    expect(stockSim.upsellSuggestions[0].accessories[0].availableQty).toBeGreaterThan(0);

    const loweredSimRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ergonomics/simulate',
      payload: {
        slug: 'ktm-350-exc-f',
        heightCm: 160,
        weightKg: 55,
        inseamCm: 73,
        bootType: 'MX_BOOTS',
        loweringLinkMm: 30,
        lowSeatMm: 25,
        barRiserMm: 20,
      },
    });
    expect(loweredSimRes.statusCode).toBe(200);
    const loweredSim = loweredSimRes.json().data;
    expect(loweredSim.sag.effectiveSeatHeightMm).toBeLessThan(
      stockSim.sag.effectiveSeatHeightMm - 40
    );
    expect(loweredSim.fitScore).toBeGreaterThan(stockSim.fitScore);
    expect(loweredSim.wireframe.seatProfile).toHaveLength(3);

    const compareRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ergonomics/compare',
      payload: {
        slugs: ['honda-crf300l', 'ktm-350-exc-f'],
        heightCm: 168,
        weightKg: 65,
        inseamCm: 76,
        bootType: 'MX_BOOTS',
        alignmentMode: 'SEAT_POCKET',
      },
    });
    expect(compareRes.statusCode).toBe(200);
    const cmp = compareRes.json().data;
    expect(cmp.alignmentMode).toBe('SEAT_POCKET');
    expect(cmp.bikeA.meta.slug).toBe('honda-crf300l');
    expect(cmp.bikeB.meta.slug).toBe('ktm-350-exc-f');
    expect(cmp.deltas.unladenSeatHeightDeltaMm).toBe(963 - 880);
    expect(typeof cmp.bikeB.overlayOffsetMm.y).toBe('number');
  });

  it('enforces RBAC, writes AuditLog, and immediately invalidates L1/L2 cache on Admin price/geometry/compatibility edits', async () => {
    // Customer blocked from Admin bike creation
    const forbiddenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/bikes',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: {
        brandId: hondaBrand.id,
        sku: `FORBID-${runId}`,
        name: 'Forbidden Bike',
        slug: `forbidden-bike-${runId}`,
        modelYear: 2026,
        category: 'ENDURO',
        ridingFocus: 'OFF_ROAD',
        engineCc: 250,
        priceVnd: 100_000_000,
        depositAmountVnd: 10_000_000,
        geometrySpec: {
          unladenSeatHeightMm: 900,
          seatWidthMm: 150,
          wheelbaseMm: 1450,
          groundClearanceMm: 300,
          frontWheelDiameterIn: 21,
          rearWheelDiameterIn: 18,
          frontTireOuterRadiusMm: 355,
          rearTireOuterRadiusMm: 338,
          frontTravelMm: 270,
          rearTravelMm: 270,
          staticSagRearMm: 30,
          staticSagFrontMm: 22,
          seatPocketXMm: 550,
          seatPocketYMm: 900,
          footpegXMm: 610,
          footpegYMm: 390,
          handlebarGripXMm: 920,
          handlebarGripYMm: 1130,
          wetWeightKg: 120,
        },
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // Admin creates a bike & warms L1 + L2 caches
    const slug = `admin-cache-bike-${runId}`;
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/bikes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        brandId: hondaBrand.id,
        sku: `CACHE-${runId}`,
        name: `Cache Test Bike ${runId}`,
        slug,
        modelYear: 2026,
        category: 'ENDURO',
        ridingFocus: 'OFF_ROAD',
        engineCc: 250,
        priceVnd: 200_000_000,
        depositAmountVnd: 20_000_000,
        stockQty: 5,
        status: 'ACTIVE',
        geometrySpec: {
          unladenSeatHeightMm: 940,
          seatWidthMm: 150,
          wheelbaseMm: 1470,
          groundClearanceMm: 320,
          frontWheelDiameterIn: 21,
          rearWheelDiameterIn: 18,
          frontTireOuterRadiusMm: 356,
          rearTireOuterRadiusMm: 340,
          frontTravelMm: 280,
          rearTravelMm: 290,
          staticSagRearMm: 32,
          staticSagFrontMm: 24,
          seatPocketXMm: 560,
          seatPocketYMm: 940,
          footpegXMm: 615,
          footpegYMm: 400,
          handlebarGripXMm: 940,
          handlebarGripYMm: 1150,
          wetWeightKg: 118,
        },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const bike = createRes.json().data.bike;
    createdBikeIds.push(bike.id);
    createdAuditEntityIds.push(bike.id);

    // Warm L1 and L2 caches via public read
    const warm1 = await app.inject({ method: 'GET', url: `/api/v1/bikes/${slug}` });
    const warm2 = await app.inject({ method: 'GET', url: '/api/v1/bikes' });
    expect(warm1.statusCode).toBe(200);
    expect(warm1.json().data.bike.priceVnd).toBe(200_000_000);
    expect(warm2.statusCode).toBe(200);
    expect(app.l1Cache.has(`df:catalog:bike:slug:${slug}`)).toBe(true);

    // SALES_STAFF cannot alter price (403), only stockQty
    const salesPriceAttempt = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/bikes/${bike.id}`,
      headers: { authorization: `Bearer ${salesToken}` },
      payload: { priceVnd: 150_000_000 },
    });
    expect(salesPriceAttempt.statusCode).toBe(403);

    // ADMIN updates price and geometrySpec -> cache invalidated immediately + AuditLog created
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/bikes/${bike.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        priceVnd: 215_000_000,
        geometrySpec: {
          unladenSeatHeightMm: 925,
          seatPocketYMm: 925,
        },
      },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(app.l1Cache.has(`df:catalog:bike:slug:${slug}`)).toBe(false);

    const postUpdateRead = await app.inject({ method: 'GET', url: `/api/v1/bikes/${slug}` });
    expect(postUpdateRead.statusCode).toBe(200);
    const freshBike = postUpdateRead.json().data.bike;
    expect(freshBike.priceVnd).toBe(215_000_000);
    expect(freshBike.geometrySpec.unladenSeatHeightMm).toBe(925);

    const updateAudit = await app.prisma.auditLog.findFirst({
      where: {
        entityType: 'Bike',
        entityId: bike.id,
        action: 'BIKE_UPDATED',
        actorId: adminUser.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(updateAudit).toBeTruthy();
    expect(updateAudit.beforeState.priceVnd).toBe(200_000_000);
    expect(updateAudit.afterState.priceVnd).toBe(215_000_000);

    // Admin creates accessory and attaches compatibility matrix
    const accRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/accessories',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        sku: `ACC-TMP-${runId}`,
        name: `Test Lowering Link ${runId}`,
        slug: `test-lowering-link-${runId}`,
        category: 'LOWERING_LINK',
        brandName: 'Zeta',
        priceVnd: 2_900_000,
        stockQty: 8,
        ergoImpactJson: { loweringLinkMm: 30, forkDropMm: 10 },
      },
    });
    expect(accRes.statusCode).toBe(201);
    const acc = accRes.json().data.accessory;
    createdAccessoryIds.push(acc.id);
    createdAuditEntityIds.push(acc.id);

    const putCompatRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/bikes/${bike.id}/compatibilities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        compatibilities: [
          {
            accessoryId: acc.id,
            exactSeatDropMm: 30,
            exactForkDropMm: 10,
            requiresWorkshopInstall: true,
            installLaborVnd: 400_000,
            fitmentNotes: 'Flush fork caps 10mm.',
          },
        ],
      },
    });
    expect(putCompatRes.statusCode).toBe(200);

    const afterCompatDetail = await app.inject({ method: 'GET', url: `/api/v1/bikes/${slug}` });
    expect(afterCompatDetail.statusCode).toBe(200);
    expect(afterCompatDetail.json().data.bike.compatibilities).toHaveLength(1);
    expect(afterCompatDetail.json().data.bike.compatibilities[0].installLaborVnd).toBe(400_000);
  });

  it('enforces Presigned Media Upload flow & blocks disguised SVG/HTML payloads via 4KB Magic Bytes inspection', async () => {
    const bike = await app.prisma.bike.findFirst({
      where: { slug: 'ktm-350-exc-f', deletedAt: null },
      select: { id: true },
    });
    expect(bike).toBeTruthy();

    // 1. Presign rejects SVG and > 5MB upfront
    const svgPresign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/svg+xml',
        sizeBytes: 1024,
      },
    });
    expect(svgPresign.statusCode).toBe(400);
    expect(svgPresign.headers['content-type']).toContain('application/problem+json');

    const oversizedPresign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: 6 * 1024 * 1024,
      },
    });
    expect(oversizedPresign.statusCode).toBe(400);

    // 2. Spoofed SVG claiming image/png -> rejected at confirm and deleted
    const spoofPresign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: SPOOFED_SVG_BYTES.length,
        originalFileName: '../../evil.png',
      },
    });
    expect(spoofPresign.statusCode).toBe(201);
    const spoofGrant = spoofPresign.json().data;
    expect(spoofGrant.storageKey.startsWith(`bikes/${bike.id}/`)).toBe(true);
    expect(spoofGrant.storageKey).not.toContain('..');

    const spoofPut = await app.inject({
      method: 'PUT',
      url: spoofGrant.uploadPath,
      headers: { 'content-type': 'image/png' },
      payload: SPOOFED_SVG_BYTES,
    });
    expect(spoofPut.statusCode).toBe(200);

    const spoofConfirm = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/confirm',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        storageKey: spoofGrant.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'GALLERY',
      },
    });
    expect(spoofConfirm.statusCode).toBe(422);
    expect(spoofConfirm.headers['content-type']).toContain('application/problem+json');
    expect(spoofConfirm.json().code).toBe('INVALID_UPLOAD_FILE');
    expect(app.storage.hasObject(spoofGrant.storageKey)).toBe(false);

    // 3. Spoofed HTML claiming image/jpeg -> rejected & deleted
    const htmlPresign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/jpeg',
        sizeBytes: SPOOFED_HTML_BYTES.length,
      },
    });
    const htmlGrant = htmlPresign.json().data;
    await app.inject({
      method: 'PUT',
      url: htmlGrant.uploadPath,
      headers: { 'content-type': 'image/jpeg' },
      payload: SPOOFED_HTML_BYTES,
    });
    const htmlConfirm = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/confirm',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        storageKey: htmlGrant.storageKey,
        declaredMimeType: 'image/jpeg',
        mediaType: 'GALLERY',
      },
    });
    expect(htmlConfirm.statusCode).toBe(422);
    expect(app.storage.hasObject(htmlGrant.storageKey)).toBe(false);

    // 4. Genuine PNG succeeds end-to-end (presign -> PUT -> confirm)
    const pngPresign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: VALID_PNG_BYTES.length,
      },
    });
    expect(pngPresign.statusCode).toBe(201);
    const pngGrant = pngPresign.json().data;

    const pngPut = await app.inject({
      method: 'PUT',
      url: pngGrant.uploadPath,
      headers: { 'content-type': 'image/png' },
      payload: VALID_PNG_BYTES,
    });
    expect(pngPut.statusCode).toBe(200);

    const pngConfirm = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/confirm',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        storageKey: pngGrant.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'GALLERY',
        altText: 'Valid test PNG gallery photo',
      },
    });
    expect(pngConfirm.statusCode).toBe(201);
    const validPngMedia = pngConfirm.json().data.media;
    createdMediaIds.push(validPngMedia.id);
    expect(pngConfirm.json().data.verifiedMime).toBe('image/png');

    // 5. Genuine JPEG succeeds end-to-end
    const jpgPresign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/jpeg',
        sizeBytes: VALID_JPEG_BYTES.length,
      },
    });
    const jpgGrant = jpgPresign.json().data;
    await app.inject({
      method: 'PUT',
      url: jpgGrant.uploadPath,
      headers: { 'content-type': 'image/jpeg' },
      payload: VALID_JPEG_BYTES,
    });
    const jpgConfirm = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/confirm',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        storageKey: jpgGrant.storageKey,
        declaredMimeType: 'image/jpeg',
        mediaType: 'GALLERY',
      },
    });
    expect(jpgConfirm.statusCode).toBe(201);
    createdMediaIds.push(jpgConfirm.json().data.media.id);
    expect(jpgConfirm.json().data.verifiedMime).toBe('image/jpeg');
  });

  it('validates Admin Blueprint Calibration UV coordinates, computes pxPerMm, writes AuditLog & exposes Phase 4 OpenAPI paths', async () => {
    // Create temporary bike + upload valid blueprint PNG so seeded blueprint stays untouched
    const slug = `calib-bike-${runId}`;
    const bikeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/bikes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        brandId: hondaBrand.id,
        sku: `CALIB-${runId}`,
        name: `Calib Test Bike ${runId}`,
        slug,
        modelYear: 2026,
        category: 'ENDURO',
        ridingFocus: 'OFF_ROAD',
        engineCc: 350,
        priceVnd: 320_000_000,
        depositAmountVnd: 25_000_000,
        stockQty: 2,
        status: 'ACTIVE',
        geometrySpec: {
          unladenSeatHeightMm: 950,
          seatWidthMm: 145,
          wheelbaseMm: 1480,
          groundClearanceMm: 340,
          frontWheelDiameterIn: 21,
          rearWheelDiameterIn: 18,
          frontTireOuterRadiusMm: 358,
          rearTireOuterRadiusMm: 342,
          frontTravelMm: 300,
          rearTravelMm: 310,
          staticSagRearMm: 34,
          staticSagFrontMm: 26,
          seatPocketXMm: 560,
          seatPocketYMm: 950,
          footpegXMm: 620,
          footpegYMm: 410,
          handlebarGripXMm: 950,
          handlebarGripYMm: 1170,
          wetWeightKg: 112,
        },
      },
    });
    expect(bikeRes.statusCode).toBe(201);
    const bike = bikeRes.json().data.bike;
    createdBikeIds.push(bike.id);

    const presign = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/presign',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        mimeType: 'image/png',
        sizeBytes: VALID_PNG_BYTES.length,
      },
    });
    const grant = presign.json().data;
    await app.inject({
      method: 'PUT',
      url: grant.uploadPath,
      headers: { 'content-type': 'image/png' },
      payload: VALID_PNG_BYTES,
    });
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/media/confirm',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        bikeId: bike.id,
        storageKey: grant.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        isPrimary: true,
      },
    });
    expect(confirm.statusCode).toBe(201);
    const media = confirm.json().data.media;
    createdMediaIds.push(media.id);

    // Invalid out-of-bounds UV (> 1)
    const outOfBoundsRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/bikes/${bike.id}/media/${media.id}/calibration`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1600,
        imageHeightPx: 1000,
        anchorsUv: {
          rearAxle: { u: 0.2, v: 0.7 },
          frontAxle: { u: 1.15, v: 0.7 },
          groundLineV: 0.91,
          seatPocket: { u: 0.43, v: 0.35 },
          footpeg: { u: 0.45, v: 0.68 },
          handlebarGrip: { u: 0.64, v: 0.24 },
        },
      },
    });
    expect(outOfBoundsRes.statusCode).toBe(400);
    expect(outOfBoundsRes.headers['content-type']).toContain('application/problem+json');

    // Geometrically reversed wheel axles for RIGHT facing
    const reversedAxlesRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/bikes/${bike.id}/media/${media.id}/calibration`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1600,
        imageHeightPx: 1000,
        anchorsUv: {
          rearAxle: { u: 0.78, v: 0.7 },
          frontAxle: { u: 0.2, v: 0.7 },
          groundLineV: 0.91,
          seatPocket: { u: 0.43, v: 0.35 },
          footpeg: { u: 0.45, v: 0.68 },
          handlebarGrip: { u: 0.64, v: 0.24 },
        },
      },
    });
    expect(reversedAxlesRes.statusCode).toBe(400);

    // Valid UV calibration (calibrated to ~950mm seat height at 1480mm wheelbase)
    const validCalibRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/bikes/${bike.id}/media/${media.id}/calibration`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1600,
        imageHeightPx: 1000,
        anchorsUv: {
          rearAxle: { u: 0.2, v: 0.7 },
          frontAxle: { u: 0.78, v: 0.7 },
          groundLineV: 0.91,
          seatPocket: { u: 0.43, v: 0.314 },
          footpeg: { u: 0.45, v: 0.66 },
          handlebarGrip: { u: 0.64, v: 0.2 },
        },
      },
    });
    expect(validCalibRes.statusCode).toBe(200);
    const calibBody = validCalibRes.json().data;
    expect(calibBody.metrics.pxPerMm).toBeGreaterThan(0.5);
    expect(calibBody.metrics.isPerspectiveDistorted).toBe(false);

    const calibAudit = await app.prisma.auditLog.findFirst({
      where: {
        entityType: 'BikeMedia',
        entityId: media.id,
        action: 'BIKE_MEDIA_CALIBRATED',
      },
    });
    expect(calibAudit).toBeTruthy();

    // Verify OpenAPI 3.0 spec compiles cleanly with all Phase 4 routes
    const docsRes = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(docsRes.statusCode).toBe(200);
    const spec = docsRes.json();
    expect(spec.paths['/api/v1/bikes']).toBeTruthy();
    expect(spec.paths['/api/v1/ergonomics/simulate']).toBeTruthy();
    expect(spec.paths['/api/v1/admin/media/presign']).toBeTruthy();
    expect(spec.paths['/api/v1/admin/bikes/{id}/media/{mediaId}/calibration']).toBeTruthy();
  });
});
