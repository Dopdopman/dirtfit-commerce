import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { signMockWebhookBody } from '../../src/modules/payments/adapters/mock.adapter.js';
import { signPayOSWebhookData } from '../../src/modules/payments/adapters/payos.adapter.js';

const SHIPPING_ADDRESS = {
  recipientName: 'Nguyen Van Enduro',
  phone: '0901234567',
  province: 'Ho Chi Minh',
  district: 'Thu Duc',
  ward: 'Linh Trung',
  streetAddress: '468 Xa Lo Ha Noi',
};

describe('Phase 5 Cart, Idempotent Orders, SELECT FOR UPDATE Race Condition, Payments & Test Rides', () => {
  let app;
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

  /**
   * Register a fresh temporary customer user for isolated concurrent/IDOR testing.
   * @param {string} tag
   * @returns {Promise<{ token: string, user: object }>}
   */
  async function registerCustomer(tag) {
    const email = `p5-${tag}-${runId}@dirtfit.vn`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: 'StrongRiderPass!2026',
        fullName: `Phase5 Rider ${tag}`,
        phone: '0901234567',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    createdUserIds.push(body.data.user.id);
    return { token: body.data.accessToken, user: body.data.user };
  }

  /**
   * Create an isolated ACTIVE test bike via Admin API.
   * @param {object} opts
   * @param {string} opts.suffix
   * @param {number} opts.stockQty
   * @param {number} [opts.priceVnd]
   * @param {number} [opts.depositAmountVnd]
   * @returns {Promise<object>}
   */
  async function createTestBike({
    suffix,
    stockQty,
    priceVnd = 250_000_000,
    depositAmountVnd = 25_000_000,
  }) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/bikes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
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
      },
    });
    expect(res.statusCode).toBe(201);
    const bike = res.json().data.bike;
    createdBikeIds.push(bike.id);
    return bike;
  }

  /**
   * Create an isolated ACTIVE test accessory via Admin API.
   * @param {object} opts
   * @param {string} opts.suffix
   * @param {number} opts.stockQty
   * @param {number} [opts.priceVnd]
   * @returns {Promise<object>}
   */
  async function createTestAccessory({ suffix, stockQty, priceVnd = 2_500_000 }) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/accessories',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        sku: `P5ACC-${suffix}-${runId}`,
        name: `Phase5 Test Accessory ${suffix}`,
        slug: `phase5-acc-${suffix}-${runId}`,
        category: 'LOWERING_LINK',
        brandName: 'Zeta',
        priceVnd,
        stockQty,
        status: 'ACTIVE',
        ergoImpactJson: { loweringLinkMm: 30, forkDropMm: 10 },
      },
    });
    expect(res.statusCode).toBe(201);
    const acc = res.json().data.accessory;
    createdAccessoryIds.push(acc.id);
    return acc;
  }

  beforeAll(async () => {
    app = await buildApp({
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

    const [adminLogin, salesLogin, brandRow] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@dirtfit.vn', password: 'Admin@DirtFit2026!' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'sales@dirtfit.vn', password: 'Sales@DirtFit2026!' },
      }),
      app.prisma.brand.findUnique({ where: { slug: 'honda' } }),
    ]);

    expect(adminLogin.statusCode).toBe(200);
    expect(salesLogin.statusCode).toBe(200);
    adminToken = adminLogin.json().data.accessToken;
    salesToken = salesLogin.json().data.accessToken;
    hondaBrand = brandRow;
  });

  afterAll(async () => {
    if (!app) {
      return;
    }

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
      await app.prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { entityId: { in: [...allOrderIds, ...createdBikeIds, ...createdAccessoryIds] } },
          ],
        },
      });
      await app.prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
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

    await app.close();
  });

  it('prevents overselling via sorted SELECT FOR UPDATE when 5 users race for stockQty=1 bike, and supports combo cart', async () => {
    const scarceBike = await createTestBike({ suffix: 'race', stockQty: 1 });
    const racers = await Promise.all([
      registerCustomer('race1'),
      registerCustomer('race2'),
      registerCustomer('race3'),
      registerCustomer('race4'),
      registerCustomer('race5'),
    ]);

    // Add the scarce bike to each racer's persistent cart beforehand
    await Promise.all(
      racers.map((racer) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/cart/items',
          headers: { authorization: `Bearer ${racer.token}` },
          payload: {
            itemType: 'BIKE',
            bikeId: scarceBike.id,
            quantity: 1,
          },
        })
      )
    );

    // Fire 5 parallel POST /api/v1/orders/checkout requests via Promise.all
    const responses = await Promise.all(
      racers.map((racer, idx) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/orders/checkout',
          headers: {
            authorization: `Bearer ${racer.token}`,
            'idempotency-key': `race-key-${runId}-${idx}`,
          },
          payload: {
            orderType: 'BIKE_DEPOSIT',
            paymentMethod: 'MOCK',
            shippingAddress: SHIPPING_ADDRESS,
          },
        })
      )
    );

    const createdResponses = responses.filter((res) => res.statusCode === 201);
    const conflictResponses = responses.filter((res) => res.statusCode === 409);

    expect(createdResponses).toHaveLength(1);
    expect(conflictResponses).toHaveLength(4);
    expect(conflictResponses[0].json().code).toBe('INSUFFICIENT_STOCK');

    const winnerOrder = createdResponses[0].json().data.order;
    createdOrderIds.push(winnerOrder.id);

    const dbBike = await app.prisma.bike.findUnique({ where: { id: scarceBike.id } });
    expect(dbBike.stockQty).toBe(1);
    expect(dbBike.reservedQty).toBe(1);

    // Also test Simulator Combo Upsell add-to-cart with labor VND calculation
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

    const putCompat = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/bikes/${comboBike.id}/compatibilities`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        compatibilities: [
          {
            accessoryId: comboAcc.id,
            exactSeatDropMm: 30,
            exactForkDropMm: 10,
            requiresWorkshopInstall: true,
            installLaborVnd: 450_000,
          },
        ],
      },
    });
    expect(putCompat.statusCode).toBe(200);

    const comboUser = await registerCustomer('combo');
    const comboCartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${comboUser.token}` },
      payload: {
        bikeId: comboBike.id,
        accessoryIds: [comboAcc.id],
        quantity: 1,
      },
    });
    expect(comboCartRes.statusCode).toBe(201);
    const cart = comboCartRes.json().data.cart;
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

    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${customer.token}` },
      payload: { itemType: 'BIKE', bikeId: bike.id, quantity: 1 },
    });

    const idemKey = `idem-key-${runId}`;
    const checkoutPayload = {
      orderType: 'BIKE_DEPOSIT',
      paymentMethod: 'MOCK',
      shippingAddress: SHIPPING_ADDRESS,
    };

    // Missing Idempotency-Key returns 400
    const missingKeyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: { authorization: `Bearer ${customer.token}` },
      payload: checkoutPayload,
    });
    expect(missingKeyRes.statusCode).toBe(400);
    expect(missingKeyRes.json().code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    // First valid checkout
    const firstRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${customer.token}`,
        'idempotency-key': idemKey,
      },
      payload: checkoutPayload,
    });
    expect(firstRes.statusCode).toBe(201);
    const firstOrderId = firstRes.json().data.order.id;
    createdOrderIds.push(firstOrderId);

    // Replay same key + exact same payload -> returns same orderId, reservedQty remains 1
    const replayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${customer.token}`,
        'idempotency-key': idemKey,
      },
      payload: checkoutPayload,
    });
    expect(replayRes.statusCode).toBe(201);
    expect(replayRes.json().data.order.id).toBe(firstOrderId);

    const dbBikeAfterReplay = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(dbBikeAfterReplay.reservedQty).toBe(1);

    // Same key + mutated payload -> 409 Conflict (IDEMPOTENCY_KEY_PAYLOAD_MISMATCH)
    const mismatchRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${customer.token}`,
        'idempotency-key': idemKey,
      },
      payload: {
        ...checkoutPayload,
        orderType: 'FULL_PURCHASE',
      },
    });
    expect(mismatchRes.statusCode).toBe(409);
    expect(mismatchRes.headers['content-type']).toContain('application/problem+json');
    expect(mismatchRes.json().code).toBe('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
  });

  it('reclaims expired reservations inline via Lazy Expiration during new checkout without waiting for cron', async () => {
    const lastUnitBike = await createTestBike({ suffix: 'lazy', stockQty: 1 });
    const oldCustomer = await registerCustomer('lazy-old');
    const newCustomer = await registerCustomer('lazy-new');

    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${oldCustomer.token}` },
      payload: { itemType: 'BIKE', bikeId: lastUnitBike.id, quantity: 1 },
    });

    const oldCheckout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${oldCustomer.token}`,
        'idempotency-key': `lazy-old-${runId}`,
      },
      payload: {
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(oldCheckout.statusCode).toBe(201);
    const oldOrderId = oldCheckout.json().data.order.id;
    createdOrderIds.push(oldOrderId);

    // Force old reservation into the past (simulate 15-min TTL expired before cron ran)
    await app.prisma.inventoryReservation.updateMany({
      where: { orderId: oldOrderId },
      data: { expiresAt: new Date(Date.now() - 120_000) },
    });

    // New customer adds bike (availableQty is 1 via Lazy Expiration) and checks out immediately
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${newCustomer.token}` },
      payload: { itemType: 'BIKE', bikeId: lastUnitBike.id, quantity: 1 },
    });
    expect(addRes.statusCode).toBe(201);

    const newCheckout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${newCustomer.token}`,
        'idempotency-key': `lazy-new-${runId}`,
      },
      payload: {
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(newCheckout.statusCode).toBe(201);
    const newOrderId = newCheckout.json().data.order.id;
    createdOrderIds.push(newOrderId);

    // Old order is automatically marked EXPIRED and bike reservedQty remains 1
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

  it('enforces COD rules, verifies PayOS/Mock webhook HMAC signatures, commits stock once on replay, and supports cancellation & Admin transitions', async () => {
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

    // 1. COD strictly blocked when cart contains a motorcycle
    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${buyer.token}` },
      payload: { itemType: 'BIKE', bikeId: bike.id, quantity: 1 },
    });

    const codBikeAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${buyer.token}`,
        'idempotency-key': `cod-ban-${runId}`,
      },
      payload: {
        orderType: 'FULL_PURCHASE',
        paymentMethod: 'COD',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(codBikeAttempt.statusCode).toBe(422);
    expect(codBikeAttempt.json().code).toBe('COD_NOT_ELIGIBLE');

    // 2. Place bike deposit order via PAYOS, then verify invalid signature -> valid signature -> replay idempotency
    const payosCheckout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${buyer.token}`,
        'idempotency-key': `payos-dep-${runId}`,
      },
      payload: {
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'PAYOS',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(payosCheckout.statusCode).toBe(201);
    const depositOrder = payosCheckout.json().data.order;
    createdOrderIds.push(depositOrder.id);
    expect(depositOrder.payableNowVnd).toBe(30_000_000);
    expect(depositOrder.remainingBalanceVnd).toBe(270_000_000);

    // Tampered PayOS HMAC signature -> 401
    const payosData = {
      orderCode: depositOrder.orderNumber,
      amount: 30_000_000,
      reference: `PAYOS_REF_${runId}`,
    };
    const badPayosRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhooks/payos',
      payload: {
        code: '00',
        success: true,
        data: payosData,
        signature: 'deadbeefdeadbeefdeadbeefdeadbeef',
      },
    });
    expect(badPayosRes.statusCode).toBe(401);
    expect(badPayosRes.json().code).toBe('INVALID_PAYMENT_SIGNATURE');

    // Valid PayOS HMAC signature -> DEPOSIT_PAID and stockQty decremented 3 -> 2, reservedQty 1 -> 0
    const validPayosSig = signPayOSWebhookData(payosData, payosChecksumKey);
    const goodPayosRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhooks/payos',
      payload: {
        code: '00',
        success: true,
        data: payosData,
        signature: validPayosSig,
      },
    });
    expect(goodPayosRes.statusCode).toBe(200);
    expect(goodPayosRes.json().data.alreadyProcessed).toBe(false);
    expect(goodPayosRes.json().data.order.status).toBe('DEPOSIT_PAID');

    const bikeAfterCommit = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(bikeAfterCommit.stockQty).toBe(2);
    expect(bikeAfterCommit.reservedQty).toBe(0);

    // Replay same PayOS webhook a 2nd time -> 200 OK, alreadyProcessed=true, NO duplicate stock deduction
    const replayPayosRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhooks/payos',
      payload: {
        code: '00',
        success: true,
        data: payosData,
        signature: validPayosSig,
      },
    });
    expect(replayPayosRes.statusCode).toBe(200);
    expect(replayPayosRes.json().data.alreadyProcessed).toBe(true);

    const bikeAfterReplay = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(bikeAfterReplay.stockQty).toBe(2);
    expect(bikeAfterReplay.reservedQty).toBe(0);

    // Admin transitions DEPOSIT_PAID -> PREPARING with AuditLog
    const adminTransition = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/orders/${depositOrder.id}/status`,
      headers: { authorization: `Bearer ${salesToken}` },
      payload: { status: 'PREPARING', internalNote: 'Pre-delivery PDI check' },
    });
    expect(adminTransition.statusCode).toBe(200);
    expect(adminTransition.json().data.order.status).toBe('PREPARING');

    // 3. Accessory-only COD order succeeds (CONFIRMED immediately) + Mock webhook test on PENDING_PAYMENT order + cancel test
    const buyer2 = await registerCustomer('pay-buyer2');
    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${buyer2.token}` },
      payload: { itemType: 'ACCESSORY', accessoryId: acc.id, quantity: 2 },
    });

    const codAccCheckout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${buyer2.token}`,
        'idempotency-key': `cod-acc-${runId}`,
      },
      payload: {
        orderType: 'ACCESSORY_ONLY',
        paymentMethod: 'COD',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(codAccCheckout.statusCode).toBe(201);
    const codOrder = codAccCheckout.json().data.order;
    createdOrderIds.push(codOrder.id);
    expect(codOrder.status).toBe('CONFIRMED');
    expect(codOrder.totalVnd).toBe(3_000_000);

    const accAfterCod = await app.prisma.accessory.findUnique({ where: { id: acc.id } });
    expect(accAfterCod.stockQty).toBe(3);

    // Mock webhook simulate test + cancel release test
    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${buyer2.token}` },
      payload: { itemType: 'ACCESSORY', accessoryId: acc.id, quantity: 1 },
    });
    const mockCheckout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${buyer2.token}`,
        'idempotency-key': `mock-acc-${runId}`,
      },
      payload: {
        orderType: 'ACCESSORY_ONLY',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(mockCheckout.statusCode).toBe(201);
    const mockOrder = mockCheckout.json().data.order;
    createdOrderIds.push(mockOrder.id);

    const mockBodyStr = JSON.stringify({
      orderId: mockOrder.id,
      outcome: 'SUCCEEDED',
      providerTxId: `MOCK_TX_${runId}`,
    });
    const mockSig = signMockWebhookBody(mockBodyStr, mockWebhookSecret);
    const mockWebhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/mock/simulate-webhook',
      headers: {
        'content-type': 'application/json',
        'x-mock-signature': mockSig,
      },
      payload: mockBodyStr,
    });
    expect(mockWebhookRes.statusCode).toBe(200);
    expect(mockWebhookRes.json().data.order.status).toBe('PAID');

    // Customer cancel test restores reservedQty
    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${buyer2.token}` },
      payload: { itemType: 'BIKE', bikeId: bike.id, quantity: 1 },
    });
    const cancelCheckout = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${buyer2.token}`,
        'idempotency-key': `cancel-${runId}`,
      },
      payload: {
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(cancelCheckout.statusCode).toBe(201);
    const toCancelOrderId = cancelCheckout.json().data.order.id;
    createdOrderIds.push(toCancelOrderId);

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${toCancelOrderId}/cancel`,
      headers: { authorization: `Bearer ${buyer2.token}` },
      payload: { reason: 'Changed model year preference' },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().data.order.status).toBe('CANCELLED');
    const bikeAfterCancel = await app.prisma.bike.findUnique({ where: { id: bike.id } });
    expect(bikeAfterCancel.reservedQty).toBe(0);
  });

  it('enforces Test Ride slot uniqueness, cross-user IDOR blocking, Internal Sweeper cron secret & OpenAPI paths', async () => {
    const bike = await createTestBike({ suffix: 'tr', stockQty: 2 });
    const riderA = await registerCustomer('rider-a');
    const riderB = await registerCustomer('rider-b');

    const slotDate = '2026-12-28';
    const slotsBefore = await app.inject({
      method: 'GET',
      url: `/api/v1/test-rides/slots?bikeId=${bike.id}&showroomCode=HCM_THU_DUC&date=${slotDate}`,
    });
    expect(slotsBefore.statusCode).toBe(200);
    expect(slotsBefore.json().data.availableSlots).toContain('09:00-10:30');

    // Rider A books slot -> 201
    const bookA = await app.inject({
      method: 'POST',
      url: '/api/v1/test-rides',
      headers: { authorization: `Bearer ${riderA.token}` },
      payload: {
        bikeId: bike.id,
        showroomCode: 'HCM_THU_DUC',
        scheduledDate: slotDate,
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      },
    });
    expect(bookA.statusCode).toBe(201);
    const bookingA = bookA.json().data.booking;
    createdTestRideIds.push(bookingA.id);

    // Rider B tries same slot -> 409 TEST_RIDE_SLOT_TAKEN
    const bookBConflict = await app.inject({
      method: 'POST',
      url: '/api/v1/test-rides',
      headers: { authorization: `Bearer ${riderB.token}` },
      payload: {
        bikeId: bike.id,
        showroomCode: 'HCM_THU_DUC',
        scheduledDate: slotDate,
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      },
    });
    expect(bookBConflict.statusCode).toBe(409);
    expect(bookBConflict.json().code).toBe('TEST_RIDE_SLOT_TAKEN');

    // Cross-user IDOR: Rider B cannot cancel Rider A's test ride OR view Rider A's order
    const idorTestRide = await app.inject({
      method: 'PATCH',
      url: `/api/v1/test-rides/${bookingA.id}/cancel`,
      headers: { authorization: `Bearer ${riderB.token}` },
    });
    expect(idorTestRide.statusCode).toBe(403);

    // Rider A places an order, Rider B gets 403 reading or cancelling it
    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${riderA.token}` },
      payload: { itemType: 'BIKE', bikeId: bike.id, quantity: 1 },
    });
    const orderARes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${riderA.token}`,
        'idempotency-key': `idor-ord-${runId}`,
      },
      payload: {
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(orderARes.statusCode).toBe(201);
    const orderA = orderARes.json().data.order;
    createdOrderIds.push(orderA.id);

    const idorReadOrder = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${orderA.id}`,
      headers: { authorization: `Bearer ${riderB.token}` },
    });
    expect(idorReadOrder.statusCode).toBe(403);

    const idorCancelOrder = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${orderA.id}/cancel`,
      headers: { authorization: `Bearer ${riderB.token}` },
    });
    expect(idorCancelOrder.statusCode).toBe(403);

    // Rider A cancels their booking -> frees slot for Rider B to book cleanly
    const cancelA = await app.inject({
      method: 'PATCH',
      url: `/api/v1/test-rides/${bookingA.id}/cancel`,
      headers: { authorization: `Bearer ${riderA.token}` },
    });
    expect(cancelA.statusCode).toBe(200);
    expect(cancelA.json().data.booking.status).toBe('CANCELLED');

    const bookBSuccess = await app.inject({
      method: 'POST',
      url: '/api/v1/test-rides',
      headers: { authorization: `Bearer ${riderB.token}` },
      payload: {
        bikeId: bike.id,
        showroomCode: 'HCM_THU_DUC',
        scheduledDate: slotDate,
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      },
    });
    expect(bookBSuccess.statusCode).toBe(201);
    createdTestRideIds.push(bookBSuccess.json().data.booking.id);

    // Internal Sweeper: expire orderA's reservation and verify X-Cron-Secret enforcement
    await app.prisma.inventoryReservation.updateMany({
      where: { orderId: orderA.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const badSweeper = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/sweeper/expire-reservations',
      headers: { 'x-cron-secret': 'wrong-secret' },
    });
    expect(badSweeper.statusCode).toBe(401);

    const goodSweeper = await app.inject({
      method: 'POST',
      url: '/api/v1/internal/sweeper/expire-reservations',
      headers: { 'x-cron-secret': cronSecret },
    });
    expect(goodSweeper.statusCode).toBe(200);
    expect(goodSweeper.json().data.sweptReservations).toBeGreaterThanOrEqual(1);
    expect(goodSweeper.json().data.expiredOrders).toBeGreaterThanOrEqual(1);

    const sweptOrderDb = await app.prisma.order.findUnique({ where: { id: orderA.id } });
    expect(sweptOrderDb.status).toBe('EXPIRED');

    // OpenAPI spec includes Phase 5 paths cleanly
    const docsRes = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(docsRes.statusCode).toBe(200);
    const paths = docsRes.json().paths;
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

    // Admin/Sales can fetch admin bike detail; CUSTOMER gets 403
    const [adminBikeRes, salesBikeRes, customerBikeRes] = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/api/v1/admin/bikes/${bike.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/admin/bikes/${bike.id}`,
        headers: { authorization: `Bearer ${salesToken}` },
      }),
      app.inject({
        method: 'GET',
        url: `/api/v1/admin/bikes/${bike.id}`,
        headers: { authorization: `Bearer ${owner.token}` },
      }),
    ]);
    expect(adminBikeRes.statusCode).toBe(200);
    expect(adminBikeRes.json().data.bike.id).toBe(bike.id);
    expect(salesBikeRes.statusCode).toBe(200);
    expect(customerBikeRes.statusCode).toBe(403);

    // Create MOCK order for owner
    await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { itemType: 'BIKE', bikeId: bike.id, quantity: 1 },
    });
    const orderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/checkout',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `sec6-mock-${runId}`,
      },
      payload: {
        orderType: 'BIKE_DEPOSIT',
        paymentMethod: 'MOCK',
        shippingAddress: SHIPPING_ADDRESS,
      },
    });
    expect(orderRes.statusCode).toBe(201);
    const order = orderRes.json().data.order;
    createdOrderIds.push(order.id);

    // Anti-IDOR: unrelated customer gets 403 on /payments/mock/complete
    const idorMockComplete = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/mock/complete',
      headers: { authorization: `Bearer ${attacker.token}` },
      payload: { orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd },
    });
    expect(idorMockComplete.statusCode).toBe(403);

    // Disabled flag app & production app must NOT mount /payments/mock/complete (404)
    const disabledFlagApp = await buildApp({
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
      const flagRes = await disabledFlagApp.inject({
        method: 'POST',
        url: '/api/v1/payments/mock/complete',
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd },
      });
      expect(flagRes.statusCode).toBe(404);
    } finally {
      await disabledFlagApp.close();
    }

    const prodApp = await buildApp({
      envOverrides: {
        NODE_ENV: 'production',
        SWAGGER_ENABLED: false,
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
      const prodRes = await prodApp.inject({
        method: 'POST',
        url: '/api/v1/payments/mock/complete',
        headers: { authorization: `Bearer ${owner.token}` },
        payload: { orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd },
      });
      expect(prodRes.statusCode).toBe(404);
    } finally {
      await prodApp.close();
    }

    // Owner succeeds in non-prod when ENABLE_MOCK_PAYMENT=true -> DEPOSIT_PAID
    const ownerCompleteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/mock/complete',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { orderId: order.id, outcome: 'SUCCEEDED', amountVnd: order.depositDueVnd },
    });
    expect(ownerCompleteRes.statusCode).toBe(200);
    expect(ownerCompleteRes.json().data.order.status).toBe('DEPOSIT_PAID');
  });
});
