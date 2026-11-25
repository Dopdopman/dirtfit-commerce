import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from './helpers/http-client.js';

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
]);

const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x0c, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

const SPOOFED_SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>',
  'utf8'
);

const SPOOFED_HTML_BYTES = Buffer.from(
  '<!DOCTYPE html><html><body><script>alert(1)</script></body></html>',
  'utf8'
);

describe('Phase 4/12 Catalog, Smart Rider-Fit, Ergonomics API, Cache Invalidation & Media Security (Supertest)', () => {
  let server;
  let app;
  let request;
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

  async function loginAs(email, password) {
    const res = await request.post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    return { token: res.body.data.accessToken, user: res.body.data.user };
  }

  beforeAll(async () => {
    server = await startTestServer({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: true,
        STORAGE_DRIVER: 'local',
        RATE_LIMIT_GLOBAL_MAX: 500,
        RATE_LIMIT_AUTH_MAX: 50,
      },
      rateLimitNamespace: `df:rl:phase4-e2e:${runId}:`,
    });
    app = server.app;
    request = server.request;

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
    if (!server) {
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
      await server.close();
    }
  });

  it('serves Public Catalog with category/Smart Rider-Fit filters, JSON-safe Number VND, soft-delete exclusion & Lazy Expiration', async () => {
    const brandsRes = await request.get('/api/v1/brands');
    expect(brandsRes.status).toBe(200);
    expect(brandsRes.body.data.brands.length).toBeGreaterThanOrEqual(5);

    const enduroRes = await request.get('/api/v1/bikes?category=ENDURO');
    expect(enduroRes.status).toBe(200);
    const enduroBikes = enduroRes.body.data;
    expect(enduroBikes.length).toBeGreaterThanOrEqual(2);
    for (const bike of enduroBikes) {
      expect(bike.category).toBe('ENDURO');
      expect(typeof bike.priceVnd).toBe('number');
      expect(typeof bike.depositAmountVnd).toBe('number');
      expect(bike.deletedAt).toBeNull();
    }

    const t0 = performance.now();
    const fitRes = await request.get(
      '/api/v1/bikes?heightCm=168&weightKg=65&inseamCm=76&bootType=MX_BOOTS&includeModdable=true'
    );
    const elapsedMs = performance.now() - t0;

    expect(fitRes.status).toBe(200);
    const fitBikes = fitRes.body.data;
    expect(fitBikes.length).toBeGreaterThanOrEqual(8);
    expect(elapsedMs).toBeLessThan(1500);

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

    const tempSlug = `temp-lazy-exp-${runId}`;
    const createRes = await request
      .post('/api/v1/admin/bikes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(createRes.status).toBe(201);
    const createdBike = createRes.body.data.bike;
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
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          orderId: tempOrder.id,
          itemType: 'BIKE',
          bikeId: createdBike.id,
          quantity: 1,
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() - 5 * 60_000),
        },
      ],
    });

    const detailRes = await request.get(`/api/v1/bikes/${tempSlug}`);
    expect(detailRes.status).toBe(200);
    const bikeDetail = detailRes.body.data.bike;
    expect(bikeDetail.stockQty).toBe(3);
    expect(bikeDetail.activeReservedQty).toBe(1);
    expect(bikeDetail.availableQty).toBe(2);

    const softDelRes = await request
      .delete(`/api/v1/admin/bikes/${createdBike.id}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(softDelRes.status).toBe(200);

    const hiddenDetailRes = await request.get(`/api/v1/bikes/${tempSlug}`);
    expect(hiddenDetailRes.status).toBe(404);

    const accRes = await request.get('/api/v1/accessories?inStock=true');
    expect(accRes.status).toBe(200);
    const accList = accRes.body.data;
    expect(accList.length).toBeGreaterThanOrEqual(8);
    expect(typeof accList[0].priceVnd).toBe('number');
    expect(accList[0].availableQty).toBeGreaterThan(0);

    const accDetailRes = await request.get(`/api/v1/accessories/${accList[0].slug}`);
    expect(accDetailRes.status).toBe(200);
    expect(typeof accDetailRes.body.data.accessory.priceVnd).toBe('number');
  });

  it('simulates 160cm rider on KTM 350 EXC-F with DB smart upsells and compares two bikes for Ghost Overlay', async () => {
    const stockSimRes = await request.post('/api/v1/ergonomics/simulate').send({
      slug: 'ktm-350-exc-f',
      heightCm: 160,
      weightKg: 55,
      inseamCm: 73,
      bootType: 'SNEAKERS',
    });
    expect(stockSimRes.status).toBe(200);
    const stockSim = stockSimRes.body.data;

    expect(stockSim.bike.slug).toBe('ktm-350-exc-f');
    expect(typeof stockSim.bike.priceVnd).toBe('number');
    expect(stockSim.footContact.contactStatus).toBe('ONE_FOOT_SHIFT');
    expect(stockSim.upsellSuggestions.length).toBeGreaterThan(0);
    expect(stockSim.upsellSuggestions[0].accessories.length).toBeGreaterThan(0);
    expect(typeof stockSim.upsellSuggestions[0].accessories[0].priceVnd).toBe('number');
    expect(stockSim.upsellSuggestions[0].accessories[0].availableQty).toBeGreaterThan(0);

    const loweredSimRes = await request.post('/api/v1/ergonomics/simulate').send({
      slug: 'ktm-350-exc-f',
      heightCm: 160,
      weightKg: 55,
      inseamCm: 73,
      bootType: 'MX_BOOTS',
      loweringLinkMm: 30,
      lowSeatMm: 25,
      barRiserMm: 20,
    });
    expect(loweredSimRes.status).toBe(200);
    const loweredSim = loweredSimRes.body.data;
    expect(loweredSim.sag.effectiveSeatHeightMm).toBeLessThan(
      stockSim.sag.effectiveSeatHeightMm - 40
    );
    expect(loweredSim.fitScore).toBeGreaterThan(stockSim.fitScore);
    expect(loweredSim.wireframe.seatProfile).toHaveLength(3);

    const compareRes = await request.post('/api/v1/ergonomics/compare').send({
      slugs: ['honda-crf300l', 'ktm-350-exc-f'],
      heightCm: 168,
      weightKg: 65,
      inseamCm: 76,
      bootType: 'MX_BOOTS',
      alignmentMode: 'SEAT_POCKET',
    });
    expect(compareRes.status).toBe(200);
    const cmp = compareRes.body.data;
    expect(cmp.alignmentMode).toBe('SEAT_POCKET');
    expect(cmp.bikeA.meta.slug).toBe('honda-crf300l');
    expect(cmp.bikeB.meta.slug).toBe('ktm-350-exc-f');
    expect(cmp.deltas.unladenSeatHeightDeltaMm).toBe(963 - 880);
    expect(typeof cmp.bikeB.overlayOffsetMm.y).toBe('number');
  });

  it('enforces RBAC, writes AuditLog, and immediately invalidates L1/L2 cache on Admin price/geometry/compatibility edits', async () => {
    const forbiddenRes = await request
      .post('/api/v1/admin/bikes')
      .set('authorization', `Bearer ${customerToken}`)
      .send({
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
      });
    expect(forbiddenRes.status).toBe(403);

    const slug = `admin-cache-bike-${runId}`;
    const createRes = await request
      .post('/api/v1/admin/bikes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(createRes.status).toBe(201);
    const bike = createRes.body.data.bike;
    createdBikeIds.push(bike.id);
    createdAuditEntityIds.push(bike.id);

    const warm1 = await request.get(`/api/v1/bikes/${slug}`);
    const warm2 = await request.get('/api/v1/bikes');
    expect(warm1.status).toBe(200);
    expect(warm1.body.data.bike.priceVnd).toBe(200_000_000);
    expect(warm2.status).toBe(200);
    expect(app.l1Cache.has(`df:catalog:bike:slug:${slug}`)).toBe(true);

    const salesPriceAttempt = await request
      .patch(`/api/v1/admin/bikes/${bike.id}`)
      .set('authorization', `Bearer ${salesToken}`)
      .send({ priceVnd: 150_000_000 });
    expect(salesPriceAttempt.status).toBe(403);

    const patchRes = await request
      .patch(`/api/v1/admin/bikes/${bike.id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        priceVnd: 215_000_000,
        geometrySpec: {
          unladenSeatHeightMm: 925,
          seatPocketYMm: 925,
        },
      });
    expect(patchRes.status).toBe(200);
    expect(app.l1Cache.has(`df:catalog:bike:slug:${slug}`)).toBe(false);

    const postUpdateRead = await request.get(`/api/v1/bikes/${slug}`);
    expect(postUpdateRead.status).toBe(200);
    const freshBike = postUpdateRead.body.data.bike;
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

    const accRes = await request
      .post('/api/v1/admin/accessories')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        sku: `ACC-TMP-${runId}`,
        name: `Test Lowering Link ${runId}`,
        slug: `test-lowering-link-${runId}`,
        category: 'LOWERING_LINK',
        brandName: 'Zeta',
        priceVnd: 2_900_000,
        stockQty: 8,
        ergoImpactJson: { loweringLinkMm: 30, forkDropMm: 10 },
      });
    expect(accRes.status).toBe(201);
    const acc = accRes.body.data.accessory;
    createdAccessoryIds.push(acc.id);
    createdAuditEntityIds.push(acc.id);

    const putCompatRes = await request
      .put(`/api/v1/admin/bikes/${bike.id}/compatibilities`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(putCompatRes.status).toBe(200);

    const afterCompatDetail = await request.get(`/api/v1/bikes/${slug}`);
    expect(afterCompatDetail.status).toBe(200);
    expect(afterCompatDetail.body.data.bike.compatibilities).toHaveLength(1);
    expect(afterCompatDetail.body.data.bike.compatibilities[0].installLaborVnd).toBe(400_000);
  });

  it('enforces Presigned Media Upload flow & blocks disguised SVG/HTML payloads via 4KB Magic Bytes inspection', async () => {
    const bike = await app.prisma.bike.findFirst({
      where: { slug: 'ktm-350-exc-f', deletedAt: null },
      select: { id: true },
    });
    expect(bike).toBeTruthy();

    const svgPresign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/svg+xml',
        sizeBytes: 1024,
      });
    expect(svgPresign.status).toBe(400);
    expect(svgPresign.headers['content-type']).toContain('application/problem+json');

    const oversizedPresign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: 6 * 1024 * 1024,
      });
    expect(oversizedPresign.status).toBe(400);

    const spoofPresign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: SPOOFED_SVG_BYTES.length,
        originalFileName: '../../evil.png',
      });
    expect(spoofPresign.status).toBe(201);
    const spoofGrant = spoofPresign.body.data;
    expect(spoofGrant.storageKey.startsWith(`bikes/${bike.id}/`)).toBe(true);
    expect(spoofGrant.storageKey).not.toContain('..');

    const spoofPut = await request
      .put(spoofGrant.uploadPath)
      .set('content-type', 'image/png')
      .send(SPOOFED_SVG_BYTES);
    expect(spoofPut.status).toBe(200);

    const spoofConfirm = await request
      .post('/api/v1/admin/media/confirm')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        storageKey: spoofGrant.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'GALLERY',
      });
    expect(spoofConfirm.status).toBe(422);
    expect(spoofConfirm.headers['content-type']).toContain('application/problem+json');
    expect(spoofConfirm.body.code).toBe('INVALID_UPLOAD_FILE');
    expect(app.storage.hasObject(spoofGrant.storageKey)).toBe(false);

    const htmlPresign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/jpeg',
        sizeBytes: SPOOFED_HTML_BYTES.length,
      });
    const htmlGrant = htmlPresign.body.data;
    await request
      .put(htmlGrant.uploadPath)
      .set('content-type', 'image/jpeg')
      .send(SPOOFED_HTML_BYTES);
    const htmlConfirm = await request
      .post('/api/v1/admin/media/confirm')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        storageKey: htmlGrant.storageKey,
        declaredMimeType: 'image/jpeg',
        mediaType: 'GALLERY',
      });
    expect(htmlConfirm.status).toBe(422);
    expect(app.storage.hasObject(htmlGrant.storageKey)).toBe(false);

    const pngPresign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: VALID_PNG_BYTES.length,
      });
    expect(pngPresign.status).toBe(201);
    const pngGrant = pngPresign.body.data;

    const pngPut = await request
      .put(pngGrant.uploadPath)
      .set('content-type', 'image/png')
      .send(VALID_PNG_BYTES);
    expect(pngPut.status).toBe(200);

    const pngConfirm = await request
      .post('/api/v1/admin/media/confirm')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        storageKey: pngGrant.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'GALLERY',
        altText: 'Valid test PNG gallery photo',
      });
    expect(pngConfirm.status).toBe(201);
    const validPngMedia = pngConfirm.body.data.media;
    createdMediaIds.push(validPngMedia.id);
    expect(pngConfirm.body.data.verifiedMime).toBe('image/png');

    const jpgPresign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'GALLERY',
        mimeType: 'image/jpeg',
        sizeBytes: VALID_JPEG_BYTES.length,
      });
    const jpgGrant = jpgPresign.body.data;
    await request.put(jpgGrant.uploadPath).set('content-type', 'image/jpeg').send(VALID_JPEG_BYTES);
    const jpgConfirm = await request
      .post('/api/v1/admin/media/confirm')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        storageKey: jpgGrant.storageKey,
        declaredMimeType: 'image/jpeg',
        mediaType: 'GALLERY',
      });
    expect(jpgConfirm.status).toBe(201);
    createdMediaIds.push(jpgConfirm.body.data.media.id);
    expect(jpgConfirm.body.data.verifiedMime).toBe('image/jpeg');
  });

  it('validates Admin Blueprint Calibration UV coordinates, computes pxPerMm, writes AuditLog & exposes Phase 4 OpenAPI paths', async () => {
    const slug = `calib-bike-${runId}`;
    const bikeRes = await request
      .post('/api/v1/admin/bikes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(bikeRes.status).toBe(201);
    const bike = bikeRes.body.data.bike;
    createdBikeIds.push(bike.id);

    const presign = await request
      .post('/api/v1/admin/media/presign')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        mimeType: 'image/png',
        sizeBytes: VALID_PNG_BYTES.length,
      });
    const grant = presign.body.data;
    await request.put(grant.uploadPath).set('content-type', 'image/png').send(VALID_PNG_BYTES);
    const confirm = await request
      .post('/api/v1/admin/media/confirm')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        bikeId: bike.id,
        storageKey: grant.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        isPrimary: true,
      });
    expect(confirm.status).toBe(201);
    const media = confirm.body.data.media;
    createdMediaIds.push(media.id);

    const outOfBoundsRes = await request
      .patch(`/api/v1/admin/bikes/${bike.id}/media/${media.id}/calibration`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(outOfBoundsRes.status).toBe(400);
    expect(outOfBoundsRes.headers['content-type']).toContain('application/problem+json');

    const reversedAxlesRes = await request
      .patch(`/api/v1/admin/bikes/${bike.id}/media/${media.id}/calibration`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(reversedAxlesRes.status).toBe(400);

    const validCalibRes = await request
      .patch(`/api/v1/admin/bikes/${bike.id}/media/${media.id}/calibration`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
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
      });
    expect(validCalibRes.status).toBe(200);
    const calibBody = validCalibRes.body.data;
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

    const docsRes = await request.get('/docs/json');
    expect(docsRes.status).toBe(200);
    const spec = docsRes.body;
    expect(spec.paths['/api/v1/bikes']).toBeTruthy();
    expect(spec.paths['/api/v1/ergonomics/simulate']).toBeTruthy();
    expect(spec.paths['/api/v1/admin/media/presign']).toBeTruthy();
    expect(spec.paths['/api/v1/admin/bikes/{id}/media/presign']).toBeTruthy();
    expect(spec.paths['/api/v1/admin/bikes/{id}/media/{mediaId}/calibration']).toBeTruthy();
    expect(spec.paths['/api/v1/admin/accessories/{id}/media/presign']).toBeTruthy();
  });

  it('manages Bike Real Photo Gallery (presign -> confirm -> set-primary -> reorder -> delete) without touching 2D Blueprint, and serves local media only outside production', async () => {
    const slug = `v21-gallery-${runId}`;
    const bikeRes = await request
      .post('/api/v1/admin/bikes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        brandId: hondaBrand.id,
        sku: `V21-GAL-${runId}`,
        name: `v21 Gallery Bike ${runId}`,
        slug,
        modelYear: 2026,
        category: 'ENDURO',
        ridingFocus: 'OFF_ROAD',
        engineCc: 350,
        priceVnd: 310_000_000,
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
      });
    expect(bikeRes.status).toBe(201);
    const bike = bikeRes.body.data.bike;
    createdBikeIds.push(bike.id);
    createdAuditEntityIds.push(bike.id);

    // 1. Upload primary 2D Blueprint first
    const bpPresign = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        mimeType: 'image/png',
        sizeBytes: VALID_PNG_BYTES.length,
      });
    expect(bpPresign.status).toBe(201);
    expect(bpPresign.body.data.storageKey.startsWith(`bikes/${bike.id}/blueprint/`)).toBe(true);
    await request
      .put(bpPresign.body.data.uploadPath)
      .set('content-type', 'image/png')
      .send(VALID_PNG_BYTES);
    const bpConfirm = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        storageKey: bpPresign.body.data.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        isPrimary: true,
      });
    expect(bpConfirm.status).toBe(201);
    const blueprintMedia = bpConfirm.body.data.media;
    createdMediaIds.push(blueprintMedia.id);

    // Verify bike with blueprint only uses BLUEPRINT fallback cleanly
    const bpOnlyDetail = await request.get(`/api/v1/bikes/${slug}`);
    expect(bpOnlyDetail.status).toBe(200);
    expect(bpOnlyDetail.body.data.bike.commercialImageKind).toBe('BLUEPRINT');
    expect(bpOnlyDetail.body.data.bike.blueprintImageUrl).toBe(blueprintMedia.url);

    // 2. Upload 2 Real GALLERY Photos (WebP + PNG)
    const g1Presign = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'GALLERY',
        mimeType: 'image/webp',
        sizeBytes: VALID_WEBP_BYTES.length,
      });
    expect(g1Presign.status).toBe(201);
    expect(g1Presign.body.data.storageKey.startsWith(`bikes/${bike.id}/photos/`)).toBe(true);
    await request
      .put(g1Presign.body.data.uploadPath)
      .set('content-type', 'image/webp')
      .send(VALID_WEBP_BYTES);
    const g1Confirm = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        storageKey: g1Presign.body.data.storageKey,
        declaredMimeType: 'image/webp',
        mediaType: 'GALLERY',
        altText: 'Studio right view',
      });
    expect(g1Confirm.status).toBe(201);
    const photo1 = g1Confirm.body.data.media;
    createdMediaIds.push(photo1.id);
    expect(photo1.isPrimary).toBe(true);

    const g2Presign = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        mediaType: 'GALLERY',
        mimeType: 'image/png',
        sizeBytes: VALID_PNG_BYTES.length,
      });
    await request
      .put(g2Presign.body.data.uploadPath)
      .set('content-type', 'image/png')
      .send(VALID_PNG_BYTES);
    const g2Confirm = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        storageKey: g2Presign.body.data.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'GALLERY',
        altText: 'Cockpit closeup',
      });
    expect(g2Confirm.status).toBe(201);
    const photo2 = g2Confirm.body.data.media;
    createdMediaIds.push(photo2.id);
    expect(photo2.isPrimary).toBe(false);

    // Local preview route serves genuine image bytes with nosniff
    const localReadRes = await request.get(`/api/v1/media/local/${g1Presign.body.data.storageKey}`);
    expect(localReadRes.status).toBe(200);
    expect(localReadRes.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(localReadRes.body).subarray(0, 4).toString('ascii')).toBe('RIFF');

    // Traversal attempts blocked
    const invalidLocalRes = await request.get('/api/v1/media/local/../../package.json');
    expect(invalidLocalRes.status).toBe(400);

    // Calibration attempt on GALLERY rejected
    const badCalib = await request
      .patch(`/api/v1/admin/bikes/${bike.id}/media/${photo1.id}/calibration`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1200,
        imageHeightPx: 800,
        anchorsUv: {
          rearAxle: { u: 0.2, v: 0.7 },
          frontAxle: { u: 0.78, v: 0.7 },
          groundLineV: 0.91,
          seatPocket: { u: 0.43, v: 0.35 },
          footpeg: { u: 0.45, v: 0.66 },
          handlebarGrip: { u: 0.64, v: 0.2 },
        },
      });
    expect(badCalib.status).toBe(400);

    // 3. Reorder + Set photo2 as Cover -> Verify blueprint stays intact & primary swaps
    const reorderRes = await request
      .patch(`/api/v1/admin/bikes/${bike.id}/media/reorder`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ orderedMediaIds: [photo2.id, photo1.id] });
    expect(reorderRes.status).toBe(200);

    const setPrimaryRes = await request
      .patch(`/api/v1/admin/bikes/${bike.id}/media/${photo2.id}/primary`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(setPrimaryRes.status).toBe(200);
    expect(setPrimaryRes.body.data.media.isPrimary).toBe(true);

    const publicDetail = await request.get(`/api/v1/bikes/${slug}`);
    expect(publicDetail.status).toBe(200);
    expect(publicDetail.body.data.bike.coverImageUrl).toBe(photo2.url);
    expect(publicDetail.body.data.bike.coverImageKind).toBe('PHOTO');
    expect(publicDetail.body.data.bike.galleryImages).toHaveLength(2);
    expect(publicDetail.body.data.bike.blueprintImageUrl).toBe(blueprintMedia.url);

    // 4. Delete current cover photo2 -> auto-promotes photo1, purges object, keeps blueprint
    const deleteRes = await request
      .delete(`/api/v1/admin/bikes/${bike.id}/media/${photo2.id}`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deletedMediaId).toBe(photo2.id);
    expect(deleteRes.body.data.promotedCoverMediaId).toBe(photo1.id);
    expect(app.storage.hasObject(photo2.storageKey)).toBe(false);

    const afterDeleteDetail = await request.get(`/api/v1/bikes/${slug}`);
    expect(afterDeleteDetail.status).toBe(200);
    expect(afterDeleteDetail.body.data.bike.coverImageUrl).toBe(photo1.url);
    expect(afterDeleteDetail.body.data.bike.blueprintImageUrl).toBe(blueprintMedia.url);

    // 5. Verify production gating on /api/v1/media/local/* -> 404
    const prodServer = await startTestServer({
      envOverrides: {
        NODE_ENV: 'production',
        SWAGGER_ENABLED: false,
        ENABLE_MOCK_OAUTH: 'false',
        GOOGLE_OAUTH_ENABLED: 'false',
        ENABLE_MOCK_PAYMENT: false,
        PAYMENT_DEFAULT_PROVIDER: 'PAYOS',
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'dummy-r2-account',
        R2_ACCESS_KEY_ID: 'dummy-r2-key',
        R2_SECRET_ACCESS_KEY: 'dummy-r2-secret',
        R2_BUCKET_NAME: 'dirtfit-media-prod',
      },
      rateLimitNamespace: `df:rl:v21-prod-media:${runId}:`,
    });
    try {
      const prodLocalRead = await prodServer.request.get(
        `/api/v1/media/local/${g1Presign.body.data.storageKey}`
      );
      expect(prodLocalRead.status).toBe(404);
    } finally {
      await prodServer.close();
    }
  });

  it('manages Accessory R2/local photo upload, Magic Bytes security, RBAC 403, replacement cleanup & delete with AuditLog', async () => {
    const createAccRes = await request
      .post('/api/v1/admin/accessories')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        sku: `ACC-MEDIA-${runId}`,
        name: `Media Test Accessory ${runId}`,
        slug: `media-test-acc-${runId}`,
        category: 'LOWERING_LINK',
        brandName: 'Zeta Racing',
        priceVnd: 3_100_000,
        stockQty: 6,
      });
    expect(createAccRes.status).toBe(201);
    const accessory = createAccRes.body.data.accessory;
    createdAccessoryIds.push(accessory.id);
    createdAuditEntityIds.push(accessory.id);
    expect(accessory.imageUrl).toBeNull();
    expect(accessory.imageKind).toBe('PLACEHOLDER');

    // RBAC: CUSTOMER and SALES_STAFF blocked with 403
    const custForbidden = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/presign`)
      .set('authorization', `Bearer ${customerToken}`)
      .send({ mimeType: 'image/png', sizeBytes: VALID_PNG_BYTES.length });
    expect(custForbidden.status).toBe(403);

    const salesForbidden = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/presign`)
      .set('authorization', `Bearer ${salesToken}`)
      .send({ mimeType: 'image/png', sizeBytes: VALID_PNG_BYTES.length });
    expect(salesForbidden.status).toBe(403);

    // Oversized & spoofed SVG blocked
    const oversized = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ mimeType: 'image/png', sizeBytes: 6 * 1024 * 1024 });
    expect(oversized.status).toBe(400);

    const spoofPresign = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ mimeType: 'image/png', sizeBytes: SPOOFED_SVG_BYTES.length });
    expect(spoofPresign.status).toBe(201);
    await request
      .put(spoofPresign.body.data.uploadPath)
      .set('content-type', 'image/png')
      .send(SPOOFED_SVG_BYTES);
    const spoofConfirm = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        storageKey: spoofPresign.body.data.storageKey,
        declaredMimeType: 'image/png',
      });
    expect(spoofConfirm.status).toBe(422);
    expect(app.storage.hasObject(spoofPresign.body.data.storageKey)).toBe(false);

    // Valid PNG upload -> confirm -> served locally
    const pngPresign = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ mimeType: 'image/png', sizeBytes: VALID_PNG_BYTES.length });
    expect(pngPresign.status).toBe(201);
    const firstKey = pngPresign.body.data.storageKey;
    expect(firstKey.startsWith(`accessories/${accessory.id}/`)).toBe(true);
    await request
      .put(pngPresign.body.data.uploadPath)
      .set('content-type', 'image/png')
      .send(VALID_PNG_BYTES);
    const pngConfirm = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ storageKey: firstKey, declaredMimeType: 'image/png' });
    expect(pngConfirm.status).toBe(200);
    expect(pngConfirm.body.data.verifiedMime).toBe('image/png');
    expect(pngConfirm.body.data.accessory.imageKind).toBe('PHOTO');
    expect(pngConfirm.body.data.accessory.imageUrl).toContain(`/api/v1/media/local/${firstKey}`);

    const servePng = await request.get(`/api/v1/media/local/${firstKey}`);
    expect(servePng.status).toBe(200);

    // Replace with WebP -> purges old PNG object cleanly
    const webpPresign = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ mimeType: 'image/webp', sizeBytes: VALID_WEBP_BYTES.length });
    const secondKey = webpPresign.body.data.storageKey;
    await request
      .put(webpPresign.body.data.uploadPath)
      .set('content-type', 'image/webp')
      .send(VALID_WEBP_BYTES);
    const webpConfirm = await request
      .post(`/api/v1/admin/accessories/${accessory.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ storageKey: secondKey, declaredMimeType: 'image/webp' });
    expect(webpConfirm.status).toBe(200);
    expect(app.storage.hasObject(firstKey)).toBe(false);
    expect(app.storage.hasObject(secondKey)).toBe(true);

    // Delete accessory photo -> nulls imageUrl & records AuditLog
    const delRes = await request
      .delete(`/api/v1/admin/accessories/${accessory.id}/media`)
      .set('authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.data.accessory.imageUrl).toBeNull();
    expect(delRes.body.data.accessory.imageKind).toBe('PLACEHOLDER');
    expect(app.storage.hasObject(secondKey)).toBe(false);

    const accAudit = await app.prisma.auditLog.findFirst({
      where: {
        entityType: 'Accessory',
        entityId: accessory.id,
        action: 'ACCESSORY_MEDIA_DELETED',
      },
    });
    expect(accAudit).toBeTruthy();
  });
});
