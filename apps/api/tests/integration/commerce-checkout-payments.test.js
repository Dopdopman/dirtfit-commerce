import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signMockWebhookBody } from '../../src/modules/payments/adapters/mock.adapter.js';
import { signPayOSWebhookData } from '../../src/modules/payments/adapters/payos.adapter.js';
import { startTestServer } from './helpers/http-client.js';

const SHIPPING_ADDRESS = {
  recipientName: 'Nguyen Van Enduro',
  phone: '0901234567',
  province: 'Ho Chi Minh',
  district: 'Thu Duc',
  ward: 'Linh Trung',
  streetAddress: '468 Xa Lo Ha Noi',
};

describe('Phase 5/12 Cart, Idempotent Orders, SELECT FOR UPDATE Race Condition, Payments & Test Rides (Supertest)', () => {
  let server;
  let app;
  let request;
  let adminToken;
  let salesToken;
  let hondaBrand;

  const runId = crypto.randomUUID().slice(0, 8);
  const cronSecret = `phase5-cron-secret-${runId}-0123456789abcdef`;
  const mockWebhookSecret = `phase5-mock-secret-${runId}-012345`;
  const payosChecksumKey = `phase5-payos-key-${runId}-012345`;

  const createdUserIds = [];
  const createdBikeIds = [];
  const createdAccessoryIds = [];
  const createdOrderIds = [];
  const createdTestRideIds = [];

  async function registerCustomer(tag) {
    const email = `p5-${tag}-${runId}@dirtfit.vn`;
    const res = await request.post('/api/v1/auth/register').send({
      email,
      password: 'StrongRiderPass!2026',
      fullName: `Phase5 Rider ${tag}`,
      phone: '0901234567',
    });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.data.user.id);
    return { token: res.body.data.accessToken, user: res.body.data.user };
  }

  async function createTestBike({
    suffix,
    stockQty,
    priceVnd = 250_000_000,
    depositAmountVnd = 25_000_000,
  }) {
    const res = await request
      .post('/api/v1/admin/bikes')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        brandId: hondaBrand.id,
        sku: `P5-${suffix}-${runId}`,
        name: `Phase5 Test Bike ${suffix}`,
        slug: `phase5-${suffix}-${runId}`,
        modelYear: 2026,
        category: 'ENDURO',
        ridingFocus: 'OFF_ROAD',
        engineCc: 350,
        priceVnd,
        depositAmountVnd,
        stockQty,
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
    expect(res.status).toBe(201);
    const bike = res.body.data.bike;
    createdBikeIds.push(bike.id);
    return bike;
  }

  async function createTestAccessory({ suffix, stockQty, priceVnd = 2_500_000 }) {
    const res = await request
      .post('/api/v1/admin/accessories')
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        sku: `P5ACC-${suffix}-${runId}`,
        name: `Phase5 Test Accessory ${suffix}`,
        slug: `phase5-acc-${suffix}-${runId}`,
        category: 'LOWERING_LINK',
        brandName: 'Zeta',
        priceVnd,
        stockQty,
        status: 'ACTIVE',
        ergoImpactJson: { loweringLinkMm: 30, forkDropMm: 10 },
      });
    expect(res.status).toBe(201);
    const acc = res.body.data.accessory;
    createdAccessoryIds.push(acc.id);
    return acc;
  }

  beforeAll(async () => {
    server = await startTestServer({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: true,
        ENABLE_MOCK_PAYMENT: true,
        PAYMENT_DEFAULT_PROVIDER: 'MOCK',
        MOCK_PAYMENT_WEBHOOK_SECRET: mockWebhookSecret,
        PAYOS_CHECKSUM_KEY: payosChecksumKey,
        CRON_HMAC_SECRET: cronSecret,
        RATE_LIMIT_GLOBAL_MAX: 1000,
        RATE_LIMIT_AUTH_MAX: 100,
      },
      rateLimitNamespace: `df:rl:phase5:${runId}:`,
    });
    app = server.app;
    request = server.request;

    const [adminLogin, salesLogin, brandRow] = await Promise.all([
      request
        .post('/api/v1/auth/login')
        .send({ email: 'admin@dirtfit.vn', password: 'Admin@DirtFit2026!' }),
      request
        .post('/api/v1/auth/login')
        .send({ email: 'sales@dirtfit.vn', password: 'Sales@DirtFit2026!' }),
      app.prisma.brand.findUnique({ where: { slug: 'honda' } }),
    ]);

    expect(adminLogin.status).toBe(200);
    expect(salesLogin.status).toBe(200);
    adminToken = adminLogin.body.data.accessToken;
    salesToken = salesLogin.body.data.accessToken;
    hondaBrand = brandRow;
  });

  afterAll(async () => {
    if (!server) {
      return;
    }

    try {
      if (createdTestRideIds.length > 0) {
        await app.prisma.testRideBooking.deleteMany({
          where: { id: { in: createdTestRideIds } },
        });
      }

      const orderIdsFromUsers =
        createdUserIds.length > 0
          ? (
              await app.prisma.order.findMany({
                where: { userId: { in: createdUserIds } },
                select: { id: true },
              })
            ).map((o) => o.id)
          : [];
      const allOrderIds = Array.from(new Set([...createdOrderIds, ...orderIdsFromUsers]));

      if (allOrderIds.length > 0) {
        await app.prisma.paymentTransaction.deleteMany({
          where: { orderId: { in: allOrderIds } },
        });
        await app.prisma.inventoryReservation.deleteMany({
          where: { orderId: { in: allOrderIds } },
        });
        await app.prisma.orderItem.deleteMany({
          where: { orderId: { in: allOrderIds } },
        });
        await app.prisma.order.deleteMany({
          where: { id: { in: allOrderIds } },
        });
      }

      if (createdUserIds.length > 0) {
        await app.prisma.idempotencyKey.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await app.prisma.cart.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await app.prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }

      const auditEntityIds = [...allOrderIds, ...createdBikeIds, ...createdAccessoryIds];
      if (createdUserIds.length > 0 || auditEntityIds.length > 0) {
        const auditWhereConditions = [];
        if (createdUserIds.length > 0) {
          auditWhereConditions.push({ actorId: { in: createdUserIds } });
        }
        if (auditEntityIds.length > 0) {
          auditWhereConditions.push({ entityId: { in: auditEntityIds } });
        }
        await app.prisma.auditLog.deleteMany({
          where: { OR: auditWhereConditions },
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

  it('prevents overselling via sorted SELECT FOR UPDATE when 5 users race over real TCP HTTP for stockQty=1 bike, and supports combo cart', async () => {
    const scarceBike = await createTestBike({ suffix: 'race', stockQty: 1 });
    const racers = await Promise.all([
      registerCustomer('race1'),
      registerCustomer('race2'),
      registerCustomer('race3'),
      registerCustomer('race4'),
      registerCustomer('race5'),
    ]);

    await Promise.all(
      racers.map((racer) =>
        request.post('/api/v1/cart/items').set('authorization', `Bearer ${racer.token}`).send({
          itemType: 'BIKE',
          bikeId: scarceBike.id,
          quantity: 1,
        })
      )
    );

    const responses = await Promise.all(
      racers.map((racer, idx) =>
        request
          .post('/api/v1/orders/checkout')
          .set('authorization', `Bearer ${racer.token}`)
          .set('idempotency-key', `race-key-${runId}-${idx}`)
          .send({
            orderType: 'BIKE_DEPOSIT',
            paymentMethod: 'MOCK',
            shippingAddress: SHIPPING_ADDRESS,
          })
      )
    );

    const createdResponses = responses.filter((res) => res.status === 201);
    const conflictResponses = responses.filter((res) => res.status === 409);

    expect(createdResponses).toHaveLength(1);
    expect(conflictResponses).toHaveLength(4);
    expect(conflictResponses[0].body.code).toBe('INSUFFICIENT_STOCK');

    const winnerOrder = createdResponses[0].body.data.order;
    createdOrderIds.push(winnerOrder.id);

    const dbBike = await app.prisma.bike.findUnique({ where: { id: scarceBike.id } });
    expect(dbBike.stockQty).toBe(1);
    expect(dbBike.reservedQty).toBe(1);

    const comboBike = await createTestBike({
      suffix: 'combo',
      stockQty: 3,
      priceVnd: 180_000_000,
      depositAmountVnd: 15_000_000,
    });
    const comboAcc = await createTestAccessory({
      suffix: 'combo',
      stockQty: 5,
      priceVnd: 2_800_000,
    });

    const putCompat = await request
      .put(`/api/v1/admin/bikes/${comboBike.id}/compatibilities`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        compatibilities: [
          {
            accessoryId: comboAcc.id,
            exactSeatDropMm: 30,
            exactForkDropMm: 10,
            requiresWorkshopInstall: true,
            installLaborVnd: 450_000,
          },
        ],
      });
    expect(putCompat.status).toBe(200);

    const comboUser = await registerCustomer('combo');
    const comboCartRes = await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${comboUser.token}`)
      .send({
        bikeId: comboBike.id,
        accessoryIds: [comboAcc.id],
        quantity: 1,
      });
    expect(comboCartRes.status).toBe(201);
    const cart = comboCartRes.body.data.cart;
    expect(cart.items).toHaveLength(2);
    expect(typeof cart.summary.totalVnd).toBe('number');
    expect(cart.summary.installLaborTotalVnd).toBe(450_000);
    expect(cart.summary.totalVnd).toBe(180_000_000 + 2_800_000 + 450_000);
    expect(cart.summary.depositPayableNowVnd).toBe(15_000_000 + 2_800_000 + 450_000);
    expect(cart.summary.codEligible).toBe(false);
  });

  it('enforces Idempotency replay (same key + same payload) and 409 Conflict on payload mismatch', async () => {
    const bike = await createTestBike({ suffix: 'idem', stockQty: 2 });
    const customer = await registerCustomer('idem');

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${customer.token}`)
      .send({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });

    const idemKey = `idem-key-${runId}`;
    const checkoutPayload = {
      orderType: 'BIKE_DEPOSIT',
      paymentMethod: 'MOCK',
      shippingAddress: SHIPPING_ADDRESS,
    };

    const missingKeyRes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${customer.token}`)
      .send(checkoutPayload);
    expect(missingKeyRes.status).toBe(400);
    expect(missingKeyRes.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const firstRes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${customer.token}`)
      .set('idempotency-key', idemKey)
      .send(checkoutPayload);
    expect(firstRes.status).toBe(201);
    const firstOrderId = firstRes.body.data.order.id;
    createdOrderIds.push(firstOrderId);

    const replayRes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${customer.token}`)
      .set('idempotency-key', idemKey)
      .send(checkoutPayload);
    expect(replayRes.status).toBe(201);
    expect(replayRes.body.data.order.id).toBe(firstOrderId);

    const dbBikeAfterReplay = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(dbBikeAfterReplay.reservedQty).toBe(1);

    const mismatchRes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${customer.token}`)
      .set('idempotency-key', idemKey)
      .send({
        ...checkoutPayload,
        orderType: 'FULL_PURCHASE',
      });
    expect(mismatchRes.status).toBe(409);
    expect(mismatchRes.headers['content-type']).toContain('application/problem+json');
    expect(mismatchRes.body.code).toBe('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
  });

  it('reclaims expired reservations inline via Lazy Expiration during new checkout without waiting for cron', async () => {
    const lastUnitBike = await createTestBike({ suffix: 'lazy', stockQty: 1 });
    const oldCustomer = await registerCustomer('lazy-old');
    const newCustomer = await registerCustomer('lazy-new');

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${oldCustomer.token}`)
      .send({ itemType: 'BIKE', bikeId: lastUnitBike.id, quantity: 1 });

    const oldCheckout = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${oldCustomer.token}`)
      .set('idempotency-key', `lazy-old-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(oldCheckout.status).toBe(201);
    const oldOrderId = oldCheckout.body.data.order.id;
    createdOrderIds.push(oldOrderId);

    await app.prisma.inventoryReservation.updateMany({
      where: { orderId: oldOrderId },
      data: { expiresAt: new Date(Date.now() - 120_000) },
    });

    const addRes = await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${newCustomer.token}`)
      .send({ itemType: 'BIKE', bikeId: lastUnitBike.id, quantity: 1 });
    expect(addRes.status).toBe(201);

    const newCheckout = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${newCustomer.token}`)
      .set('idempotency-key', `lazy-new-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(newCheckout.status).toBe(201);
    const newOrderId = newCheckout.body.data.order.id;
    createdOrderIds.push(newOrderId);

    const oldOrderDb = await app.prisma.order.findUnique({ where: { id: oldOrderId } });
    const oldResDb = await app.prisma.inventoryReservation.findFirst({
      where: { orderId: oldOrderId },
    });
    const bikeDb = await app.prisma.bike.findUnique({ where: { id: lastUnitBike.id } });

    expect(oldOrderDb.status).toBe('EXPIRED');
    expect(oldResDb.status).toBe('EXPIRED');
    expect(bikeDb.stockQty).toBe(1);
    expect(bikeDb.reservedQty).toBe(1);
  });

  it('enforces COD rules, verifies PayOS/Mock webhook HMAC signatures over raw HTTP body, commits stock once on replay, and supports cancellation & Admin transitions', async () => {
    const bike = await createTestBike({
      suffix: 'pay',
      stockQty: 3,
      priceVnd: 300_000_000,
      depositAmountVnd: 30_000_000,
    });
    const acc = await createTestAccessory({
      suffix: 'cod',
      stockQty: 5,
      priceVnd: 1_500_000,
    });
    const buyer = await registerCustomer('pay-buyer');

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${buyer.token}`)
      .send({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });

    const codBikeAttempt = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${buyer.token}`)
      .set('idempotency-key', `cod-ban-${runId}`)
      .send({
        orderType: 'FULL_PURCHASE',
        paymentMethod: 'COD',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(codBikeAttempt.status).toBe(422);
    expect(codBikeAttempt.body.code).toBe('COD_NOT_ELIGIBLE');

    const payosCheckout = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${buyer.token}`)
      .set('idempotency-key', `payos-dep-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'PAYOS',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(payosCheckout.status).toBe(201);
    const depositOrder = payosCheckout.body.data.order;
    createdOrderIds.push(depositOrder.id);
    expect(depositOrder.payableNowVnd).toBe(30_000_000);
    expect(depositOrder.remainingBalanceVnd).toBe(270_000_000);

    const payosData = {
      orderCode: depositOrder.orderNumber,
      amount: 30_000_000,
      reference: `PAYOS_REF_${runId}`,
    };
    const badPayosRes = await request.post('/api/v1/payments/webhooks/payos').send({
      code: '00',
      success: true,
      data: payosData,
      signature: 'deadbeefdeadbeefdeadbeefdeadbeef',
    });
    expect(badPayosRes.status).toBe(401);
    expect(badPayosRes.body.code).toBe('INVALID_PAYMENT_SIGNATURE');

    const validPayosSig = signPayOSWebhookData(payosData, payosChecksumKey);
    const goodPayosRes = await request.post('/api/v1/payments/webhooks/payos').send({
      code: '00',
      success: true,
      data: payosData,
      signature: validPayosSig,
    });
    expect(goodPayosRes.status).toBe(200);
    expect(goodPayosRes.body.data.alreadyProcessed).toBe(false);
    expect(goodPayosRes.body.data.order.status).toBe('DEPOSIT_PAID');

    const bikeAfterCommit = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(bikeAfterCommit.stockQty).toBe(2);
    expect(bikeAfterCommit.reservedQty).toBe(0);

    const replayPayosRes = await request.post('/api/v1/payments/webhooks/payos').send({
      code: '00',
      success: true,
      data: payosData,
      signature: validPayosSig,
    });
    expect(replayPayosRes.status).toBe(200);
    expect(replayPayosRes.body.data.alreadyProcessed).toBe(true);

    const bikeAfterReplay = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(bikeAfterReplay.stockQty).toBe(2);
    expect(bikeAfterReplay.reservedQty).toBe(0);

    const adminTransition = await request
      .patch(`/api/v1/admin/orders/${depositOrder.id}/status`)
      .set('authorization', `Bearer ${salesToken}`)
      .send({ status: 'PREPARING', internalNote: 'Pre-delivery PDI check' });
    expect(adminTransition.status).toBe(200);
    expect(adminTransition.body.data.order.status).toBe('PREPARING');

    const buyer2 = await registerCustomer('pay-buyer2');
    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${buyer2.token}`)
      .send({ itemType: 'ACCESSORY', accessoryId: acc.id, quantity: 2 });

    const codAccCheckout = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${buyer2.token}`)
      .set('idempotency-key', `cod-acc-${runId}`)
      .send({
        orderType: 'ACCESSORY_ONLY',
        paymentMethod: 'COD',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(codAccCheckout.status).toBe(201);
    const codOrder = codAccCheckout.body.data.order;
    createdOrderIds.push(codOrder.id);
    expect(codOrder.status).toBe('CONFIRMED');
    expect(codOrder.totalVnd).toBe(3_000_000);

    const accAfterCod = await app.prisma.accessory.findUnique({ where: { id: acc.id } });
    expect(accAfterCod.stockQty).toBe(3);

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${buyer2.token}`)
      .send({ itemType: 'ACCESSORY', accessoryId: acc.id, quantity: 1 });
    const mockCheckout = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${buyer2.token}`)
      .set('idempotency-key', `mock-acc-${runId}`)
      .send({
        orderType: 'ACCESSORY_ONLY',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(mockCheckout.status).toBe(201);
    const mockOrder = mockCheckout.body.data.order;
    createdOrderIds.push(mockOrder.id);

    const mockBodyStr = JSON.stringify({
      orderId: mockOrder.id,
      outcome: 'SUCCEEDED',
      providerTxId: `MOCK_TX_${runId}`,
    });
    const mockSig = signMockWebhookBody(mockBodyStr, mockWebhookSecret);
    const mockWebhookRes = await request
      .post('/api/v1/payments/mock/simulate-webhook')
      .set('content-type', 'application/json')
      .set('x-mock-signature', mockSig)
      .send(mockBodyStr);
    expect(mockWebhookRes.status).toBe(200);
    expect(mockWebhookRes.body.data.order.status).toBe('PAID');

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${buyer2.token}`)
      .send({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });
    const cancelCheckout = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${buyer2.token}`)
      .set('idempotency-key', `cancel-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(cancelCheckout.status).toBe(201);
    const toCancelOrderId = cancelCheckout.body.data.order.id;
    createdOrderIds.push(toCancelOrderId);

    const cancelRes = await request
      .post(`/api/v1/orders/${toCancelOrderId}/cancel`)
      .set('authorization', `Bearer ${buyer2.token}`)
      .send({ reason: 'Changed model year preference' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.order.status).toBe('CANCELLED');
    const bikeAfterCancel = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(bikeAfterCancel.reservedQty).toBe(0);
  });

  it('enforces Test Ride slot uniqueness, cross-user IDOR blocking, Internal Sweeper cron secret & OpenAPI paths', async () => {
    const bike = await createTestBike({ suffix: 'tr', stockQty: 2 });
    const riderA = await registerCustomer('rider-a');
    const riderB = await registerCustomer('rider-b');

    const slotDate = '2026-12-28';
    const slotsBefore = await request.get(
      `/api/v1/test-rides/slots?bikeId=${bike.id}&showroomCode=HCM_THU_DUC&date=${slotDate}`
    );
    expect(slotsBefore.status).toBe(200);
    expect(slotsBefore.body.data.availableSlots).toContain('09:00-10:30');

    const bookA = await request
      .post('/api/v1/test-rides')
      .set('authorization', `Bearer ${riderA.token}`)
      .send({
        bikeId: bike.id,
        showroomCode: 'HCM_THU_DUC',
        scheduledDate: slotDate,
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      });
    expect(bookA.status).toBe(201);
    const bookingA = bookA.body.data.booking;
    createdTestRideIds.push(bookingA.id);

    const bookBConflict = await request
      .post('/api/v1/test-rides')
      .set('authorization', `Bearer ${riderB.token}`)
      .send({
        bikeId: bike.id,
        showroomCode: 'HCM_THU_DUC',
        scheduledDate: slotDate,
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      });
    expect(bookBConflict.status).toBe(409);
    expect(bookBConflict.body.code).toBe('TEST_RIDE_SLOT_TAKEN');

    const idorTestRide = await request
      .patch(`/api/v1/test-rides/${bookingA.id}/cancel`)
      .set('authorization', `Bearer ${riderB.token}`);
    expect(idorTestRide.status).toBe(403);

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${riderA.token}`)
      .send({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });
    const orderARes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${riderA.token}`)
      .set('idempotency-key', `idor-ord-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(orderARes.status).toBe(201);
    const orderA = orderARes.body.data.order;
    createdOrderIds.push(orderA.id);

    const idorReadOrder = await request
      .get(`/api/v1/orders/${orderA.id}`)
      .set('authorization', `Bearer ${riderB.token}`);
    expect(idorReadOrder.status).toBe(403);

    const idorCancelOrder = await request
      .post(`/api/v1/orders/${orderA.id}/cancel`)
      .set('authorization', `Bearer ${riderB.token}`);
    expect(idorCancelOrder.status).toBe(403);

    const cancelA = await request
      .patch(`/api/v1/test-rides/${bookingA.id}/cancel`)
      .set('authorization', `Bearer ${riderA.token}`);
    expect(cancelA.status).toBe(200);
    expect(cancelA.body.data.booking.status).toBe('CANCELLED');

    const bookBSuccess = await request
      .post('/api/v1/test-rides')
      .set('authorization', `Bearer ${riderB.token}`)
      .send({
        bikeId: bike.id,
        showroomCode: 'HCM_THU_DUC',
        scheduledDate: slotDate,
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      });
    expect(bookBSuccess.status).toBe(201);
    createdTestRideIds.push(bookBSuccess.body.data.booking.id);

    await app.prisma.inventoryReservation.updateMany({
      where: { orderId: orderA.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const badSweeper = await request
      .post('/api/v1/internal/sweeper/expire-reservations')
      .set('x-cron-secret', 'wrong-secret');
    expect(badSweeper.status).toBe(401);

    const goodSweeper = await request
      .post('/api/v1/internal/sweeper/expire-reservations')
      .set('x-cron-secret', cronSecret);
    expect(goodSweeper.status).toBe(200);
    expect(goodSweeper.body.data.sweptReservations).toBeGreaterThanOrEqual(1);
    expect(goodSweeper.body.data.expiredOrders).toBeGreaterThanOrEqual(1);

    const sweptOrderDb = await app.prisma.order.findUnique({ where: { id: orderA.id } });
    expect(sweptOrderDb.status).toBe('EXPIRED');

    const docsRes = await request.get('/docs/json');
    expect(docsRes.status).toBe(200);
    const paths = docsRes.body.paths;
    expect(paths['/api/v1/cart']).toBeTruthy();
    expect(paths['/api/v1/orders/checkout']).toBeTruthy();
    expect(paths['/api/v1/payments/webhooks/payos']).toBeTruthy();
    expect(paths['/api/v1/test-rides']).toBeTruthy();
    expect(paths['/api/v1/internal/sweeper/expire-reservations']).toBeTruthy();
    expect(paths['/api/v1/admin/bikes/{id}']).toBeTruthy();
  });

  it('enforces production/flag gating & anti-IDOR on POST /api/v1/payments/mock/complete and RBAC on GET /api/v1/admin/bikes/:id', async () => {
    const bike = await createTestBike({ suffix: 'sec6', stockQty: 2, priceVnd: 185_000_000 });
    const owner = await registerCustomer('sec6owner');
    const attacker = await registerCustomer('sec6attacker');

    const [adminBikeRes, salesBikeRes, customerBikeRes] = await Promise.all([
      request.get(`/api/v1/admin/bikes/${bike.id}`).set('authorization', `Bearer ${adminToken}`),
      request.get(`/api/v1/admin/bikes/${bike.id}`).set('authorization', `Bearer ${salesToken}`),
      request.get(`/api/v1/admin/bikes/${bike.id}`).set('authorization', `Bearer ${owner.token}`),
    ]);
    expect(adminBikeRes.status).toBe(200);
    expect(adminBikeRes.body.data.bike.id).toBe(bike.id);
    expect(salesBikeRes.status).toBe(200);
    expect(customerBikeRes.status).toBe(403);

    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${owner.token}`)
      .send({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });
    const orderRes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${owner.token}`)
      .set('idempotency-key', `sec6-mock-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data.order;
    createdOrderIds.push(order.id);

    const idorMockComplete = await request
      .post('/api/v1/payments/mock/complete')
      .set('authorization', `Bearer ${attacker.token}`)
      .send({ orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd });
    expect(idorMockComplete.status).toBe(403);

    const disabledFlagServer = await startTestServer({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: false,
        ENABLE_MOCK_PAYMENT: false,
        PAYMENT_DEFAULT_PROVIDER: 'PAYOS',
        PAYOS_CHECKSUM_KEY: payosChecksumKey,
      },
      rateLimitNamespace: `df:rl:phase7:flag:${runId}:`,
    });
    try {
      const flagRes = await disabledFlagServer.request
        .post('/api/v1/payments/mock/complete')
        .set('authorization', `Bearer ${owner.token}`)
        .send({ orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd });
      expect(flagRes.status).toBe(404);
    } finally {
      await disabledFlagServer.close();
    }

    const prodServer = await startTestServer({
      envOverrides: {
        NODE_ENV: 'production',
        SWAGGER_ENABLED: false,
        ENABLE_MOCK_OAUTH: 'false',
        GOOGLE_OAUTH_ENABLED: 'false',
        ENABLE_MOCK_PAYMENT: false,
        PAYMENT_DEFAULT_PROVIDER: 'PAYOS',
        PAYOS_CHECKSUM_KEY: payosChecksumKey,
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'dummy-r2-account',
        R2_ACCESS_KEY_ID: 'dummy-r2-access-key',
        R2_SECRET_ACCESS_KEY: 'dummy-r2-secret-key',
        R2_BUCKET_NAME: 'dirtfit-media-prod',
      },
      rateLimitNamespace: `df:rl:phase7:prod:${runId}:`,
    });
    try {
      const prodRes = await prodServer.request
        .post('/api/v1/payments/mock/complete')
        .set('authorization', `Bearer ${owner.token}`)
        .send({ orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd });
      expect(prodRes.status).toBe(404);
    } finally {
      await prodServer.close();
    }

    const ownerCompleteRes = await request
      .post('/api/v1/payments/mock/complete')
      .set('authorization', `Bearer ${owner.token}`)
      .send({ orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd });
    expect(ownerCompleteRes.status).toBe(200);
    expect(ownerCompleteRes.body.data.order.status).toBe('DEPOSIT_PAID');
  });

  it('enriches Cart (GET/POST) and Orders (GET /orders & /orders/:id) with imageUrl, imageKind, and deep-link productUrl', async () => {
    const validPng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
    ]);

    const buyer = await registerCustomer('richcart');
    const bike = await createTestBike({ suffix: 'richcart', stockQty: 2, priceVnd: 195_000_000 });
    const acc = await createTestAccessory({
      suffix: 'richcart',
      stockQty: 5,
      priceVnd: 3_500_000,
    });

    // Upload real PNG photo to Bike
    const bikePresign = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ mediaType: 'GALLERY', mimeType: 'image/png', sizeBytes: validPng.length });
    expect(bikePresign.status).toBe(201);
    await request
      .put(bikePresign.body.data.uploadPath)
      .set('content-type', 'image/png')
      .send(validPng);
    const bikeConfirm = await request
      .post(`/api/v1/admin/bikes/${bike.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        storageKey: bikePresign.body.data.storageKey,
        declaredMimeType: 'image/png',
        mediaType: 'GALLERY',
        isPrimary: true,
      });
    expect(bikeConfirm.status).toBe(201);

    // Upload real PNG photo to Accessory
    const accPresign = await request
      .post(`/api/v1/admin/accessories/${acc.id}/media/presign`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ mimeType: 'image/png', sizeBytes: validPng.length });
    expect(accPresign.status).toBe(201);
    await request
      .put(accPresign.body.data.uploadPath)
      .set('content-type', 'image/png')
      .send(validPng);
    const accConfirm = await request
      .post(`/api/v1/admin/accessories/${acc.id}/media/confirm`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({
        storageKey: accPresign.body.data.storageKey,
        declaredMimeType: 'image/png',
      });
    expect(accConfirm.status).toBe(200);

    // Add both to buyer cart
    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${buyer.token}`)
      .send({ itemType: 'BIKE', bikeId: bike.id, quantity: 1 });
    await request
      .post('/api/v1/cart/items')
      .set('authorization', `Bearer ${buyer.token}`)
      .send({ itemType: 'ACCESSORY', accessoryId: acc.id, quantity: 1 });

    const cartRes = await request.get('/api/v1/cart').set('authorization', `Bearer ${buyer.token}`);
    expect(cartRes.status).toBe(200);
    const cartItems = cartRes.body.data.cart.items;
    expect(cartItems).toHaveLength(2);

    const bikeCartItem = cartItems.find((i) => i.itemType === 'BIKE');
    const accCartItem = cartItems.find((i) => i.itemType === 'ACCESSORY');

    expect(bikeCartItem.productUrl).toBe(`/bikes/${bike.slug}`);
    expect(bikeCartItem.imageKind).toBe('PHOTO');
    expect(bikeCartItem.imageUrl).toContain('/api/v1/media/local/');
    expect(bikeCartItem.product.productUrl).toBe(`/bikes/${bike.slug}`);
    expect(bikeCartItem.product.imageUrl).toBe(bikeCartItem.imageUrl);
    expect(bikeCartItem.product.brand).toBe('Honda');

    expect(accCartItem.productUrl).toBe(`/accessories?sku=${encodeURIComponent(acc.sku)}`);
    expect(accCartItem.imageKind).toBe('PHOTO');
    expect(accCartItem.imageUrl).toContain('/api/v1/media/local/');
    expect(accCartItem.product.productUrl).toBe(accCartItem.productUrl);

    // Checkout and verify enriched Order & Orders list
    const checkoutRes = await request
      .post('/api/v1/orders/checkout')
      .set('authorization', `Bearer ${buyer.token}`)
      .set('idempotency-key', `richcart-checkout-${runId}`)
      .send({
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      });
    expect(checkoutRes.status).toBe(201);
    const placedOrder = checkoutRes.body.data.order;
    createdOrderIds.push(placedOrder.id);

    const ordersListRes = await request
      .get('/api/v1/orders')
      .set('authorization', `Bearer ${buyer.token}`);
    expect(ordersListRes.status).toBe(200);
    const fetchedOrder = ordersListRes.body.data.find((o) => o.id === placedOrder.id);
    expect(fetchedOrder).toBeTruthy();

    const ordBikeItem = fetchedOrder.items.find((i) => i.itemType === 'BIKE');
    const ordAccItem = fetchedOrder.items.find((i) => i.itemType === 'ACCESSORY');
    expect(ordBikeItem.productUrl).toBe(`/bikes/${bike.slug}`);
    expect(ordBikeItem.imageKind).toBe('PHOTO');
    expect(ordBikeItem.imageUrl).toBe(bikeCartItem.imageUrl);
    expect(ordAccItem.productUrl).toBe(`/accessories?sku=${encodeURIComponent(acc.sku)}`);
    expect(ordAccItem.imageKind).toBe('PHOTO');
    expect(ordAccItem.imageUrl).toBe(accCartItem.imageUrl);
  });
});
