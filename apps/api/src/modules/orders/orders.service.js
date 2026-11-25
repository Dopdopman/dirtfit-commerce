import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AppError,
  COD_MAX_AMOUNT_VND,
  ERROR_CODES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  USER_ROLES,
  buildAccessoryProductUrl,
  buildBikeProductUrl,
  resolveAccessoryMedia,
  resolveBikeMedia,
  toSafeVndNumber,
} from '@dirtfit/shared';
import { invalidateCatalogCache } from '../../common/cache/catalog-cache.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { getPaymentAdapter } from '../payments/adapters/payment-adapter.registry.js';
import { assertValidOrderTransition } from './order-state-machine.js';
import { findOrderById, findOrdersPaginated } from './orders.repository.js';

const ORDER_CHECKOUT_SCOPE = 'ORDER_CHECKOUT';

/**
 * Recursively canonicalize an object with sorted keys so SHA-256 requestHash is deterministic.
 * @param {unknown} val
 * @returns {unknown}
 */
function canonicalize(val) {
  if (Array.isArray(val)) {
    return val.map(canonicalize);
  }
  if (val && typeof val === 'object' && !(val instanceof Date)) {
    const sorted = {};
    for (const key of Object.keys(val).sort()) {
      if (val[key] !== undefined) {
        sorted[key] = canonicalize(val[key]);
      }
    }
    return sorted;
  }
  return val;
}

/**
 * Compute deterministic SHA-256 hex digest of a normalized checkout payload.
 * @param {object} payload
 * @returns {string}
 */
function hashCanonicalPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

/**
 * Generate a human-readable unique order number (e.g. DF-20261125-A1B2C3).
 * @returns {string}
 */
function generateOrderNumber() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `DF-${datePart}-${randomPart}`;
}

/**
 * Execute inline Lazy Expiration for ACTIVE reservations whose expires_at <= NOW()
 * touching any locked bikeIds or accessoryIds, releasing reserved_qty and expiring stale orders.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {object} params
 * @param {string[]} params.bikeIds
 * @param {string[]} params.accessoryIds
 * @param {Map<string, object>} params.bikeMap
 * @param {Map<string, object>} params.accMap
 * @returns {Promise<{ expiredReservationCount: number }>}
 */
async function reclaimExpiredReservationsInline(tx, { bikeIds, accessoryIds, bikeMap, accMap }) {
  const itemFilters = [];
  if (bikeIds.length > 0) {
    itemFilters.push(
      Prisma.sql`(item_type = 'BIKE' AND bike_id IN (${Prisma.join(bikeIds.map((id) => Prisma.sql`${id}::uuid`))}))`
    );
  }
  if (accessoryIds.length > 0) {
    itemFilters.push(
      Prisma.sql`(item_type = 'ACCESSORY' AND accessory_id IN (${Prisma.join(accessoryIds.map((id) => Prisma.sql`${id}::uuid`))}))`
    );
  }

  if (itemFilters.length === 0) {
    return { expiredReservationCount: 0 };
  }

  const expiredRows = await tx.$queryRaw`
    SELECT id, order_id, item_type, bike_id, accessory_id, quantity
    FROM inventory_reservations
    WHERE status = 'ACTIVE'
      AND expires_at <= NOW()
      AND (${Prisma.join(itemFilters, ' OR ')})
    ORDER BY id ASC
    FOR UPDATE
  `;

  if (expiredRows.length === 0) {
    return { expiredReservationCount: 0 };
  }

  const expiredIds = expiredRows.map((r) => r.id);
  const bikeReleaseTotals = new Map();
  const accReleaseTotals = new Map();
  const touchedOrderIds = new Set();

  for (const row of expiredRows) {
    touchedOrderIds.add(row.order_id);
    if (row.item_type === 'BIKE' && row.bike_id) {
      bikeReleaseTotals.set(
        row.bike_id,
        (bikeReleaseTotals.get(row.bike_id) ?? 0) + Number(row.quantity)
      );
    }
    if (row.item_type === 'ACCESSORY' && row.accessory_id) {
      accReleaseTotals.set(
        row.accessory_id,
        (accReleaseTotals.get(row.accessory_id) ?? 0) + Number(row.quantity)
      );
    }
  }

  await tx.$executeRaw`
    UPDATE inventory_reservations
    SET status = 'EXPIRED', resolved_at = NOW()
    WHERE id IN (${Prisma.join(expiredIds.map((id) => Prisma.sql`${id}::uuid`))})
  `;

  for (const [bikeId, releaseQty] of bikeReleaseTotals.entries()) {
    await tx.$executeRaw`
      UPDATE bikes
      SET reserved_qty = GREATEST(0, reserved_qty - ${releaseQty}), version = version + 1
      WHERE id = ${bikeId}::uuid
    `;
    const row = bikeMap.get(bikeId);
    if (row) {
      row.reserved_qty = Math.max(0, Number(row.reserved_qty) - releaseQty);
    }
  }

  for (const [accId, releaseQty] of accReleaseTotals.entries()) {
    await tx.$executeRaw`
      UPDATE accessories
      SET reserved_qty = GREATEST(0, reserved_qty - ${releaseQty}), version = version + 1
      WHERE id = ${accId}::uuid
    `;
    const row = accMap.get(accId);
    if (row) {
      row.reserved_qty = Math.max(0, Number(row.reserved_qty) - releaseQty);
    }
  }

  const orderIdList = Array.from(touchedOrderIds).sort();
  if (orderIdList.length > 0) {
    await tx.$executeRaw`
      UPDATE orders o
      SET status = 'EXPIRED', updated_at = NOW()
      WHERE o.id IN (${Prisma.join(orderIdList.map((id) => Prisma.sql`${id}::uuid`))})
        AND o.status = 'PENDING_PAYMENT'
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_reservations r
          WHERE r.order_id = o.id
            AND r.status = 'ACTIVE'
            AND r.expires_at > NOW()
        )
    `;
  }

  return { expiredReservationCount: expiredRows.length };
}

/**
 * Release all ACTIVE inventory reservations held by an order when cancelled.
 * Locks referenced bikes & accessories in sorted ASC order to prevent deadlocks.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {string} orderId
 * @returns {Promise<number>}
 */
export async function releaseOrderReservations(tx, orderId) {
  const activeReservations = await tx.$queryRaw`
    SELECT id, item_type, bike_id, accessory_id, quantity
    FROM inventory_reservations
    WHERE order_id = ${orderId}::uuid
      AND status = 'ACTIVE'
    ORDER BY id ASC
    FOR UPDATE
  `;

  if (activeReservations.length === 0) {
    return 0;
  }

  const bikeTotals = new Map();
  const accTotals = new Map();

  for (const res of activeReservations) {
    if (res.item_type === 'BIKE' && res.bike_id) {
      bikeTotals.set(res.bike_id, (bikeTotals.get(res.bike_id) ?? 0) + Number(res.quantity));
    }
    if (res.item_type === 'ACCESSORY' && res.accessory_id) {
      accTotals.set(
        res.accessory_id,
        (accTotals.get(res.accessory_id) ?? 0) + Number(res.quantity)
      );
    }
  }

  const bikeIds = Array.from(bikeTotals.keys()).sort();
  const accIds = Array.from(accTotals.keys()).sort();

  if (bikeIds.length > 0) {
    await tx.$queryRaw`
      SELECT id FROM bikes
      WHERE id IN (${Prisma.join(bikeIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY id ASC
      FOR UPDATE
    `;
    for (const bikeId of bikeIds) {
      const releaseQty = bikeTotals.get(bikeId);
      await tx.$executeRaw`
        UPDATE bikes
        SET reserved_qty = GREATEST(0, reserved_qty - ${releaseQty}), version = version + 1
        WHERE id = ${bikeId}::uuid
      `;
    }
  }

  if (accIds.length > 0) {
    await tx.$queryRaw`
      SELECT id FROM accessories
      WHERE id IN (${Prisma.join(accIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY id ASC
      FOR UPDATE
    `;
    for (const accId of accIds) {
      const releaseQty = accTotals.get(accId);
      await tx.$executeRaw`
        UPDATE accessories
        SET reserved_qty = GREATEST(0, reserved_qty - ${releaseQty}), version = version + 1
        WHERE id = ${accId}::uuid
      `;
    }
  }

  const resIds = activeReservations.map((r) => r.id);
  await tx.$executeRaw`
    UPDATE inventory_reservations
    SET status = 'RELEASED', resolved_at = NOW()
    WHERE id IN (${Prisma.join(resIds.map((id) => Prisma.sql`${id}::uuid`))})
  `;

  return activeReservations.length;
}

/**
 * Checkout current user cart with mandatory Idempotency-Key, sorted SELECT ... FOR UPDATE locking,
 * inline Lazy Expiration recovery, DB-sourced BigInt pricing, and Payment Adapter session creation.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} userId
 * @param {string|undefined} idempotencyKey
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<{ replayed: boolean, status: number, data?: object, responseBody?: object }>}
 */
export async function checkoutFromCart(app, userId, idempotencyKey, payload, auditCtx) {
  if (
    typeof idempotencyKey !== 'string' ||
    idempotencyKey.trim().length < 8 ||
    idempotencyKey.trim().length > 128
  ) {
    throw new AppError({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
      status: 400,
      title: 'Idempotency-Key header is required',
      detail: 'Provide a unique Idempotency-Key header (8-128 characters) when placing an order.',
    });
  }

  const cleanKey = idempotencyKey.trim();
  const requestHash = hashCanonicalPayload(payload);

  // Purge any expired idempotency key for this slot before claiming
  await app.prisma.idempotencyKey.deleteMany({
    where: {
      scope: ORDER_CHECKOUT_SCOPE,
      key: cleanKey,
      userId,
      expiresAt: { lte: new Date() },
    },
  });

  let claimedKeyId = null;
  try {
    const claimed = await app.prisma.idempotencyKey.create({
      data: {
        scope: ORDER_CHECKOUT_SCOPE,
        key: cleanKey,
        userId,
        requestHash,
        isProcessing: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    claimedKeyId = claimed.id;
  } catch (err) {
    if (err?.code === 'P2002') {
      const existing = await app.prisma.idempotencyKey.findUnique({
        where: {
          scope_key_userId: { scope: ORDER_CHECKOUT_SCOPE, key: cleanKey, userId },
        },
      });
      if (!existing) {
        throw err;
      }
      if (existing.requestHash !== requestHash) {
        throw new AppError({
          code: ERROR_CODES.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
          status: 409,
          title: 'Idempotency key payload mismatch',
          detail: 'This Idempotency-Key was previously used with a different checkout payload.',
        });
      }
      if (existing.isProcessing) {
        throw new AppError({
          code: ERROR_CODES.REQUEST_IN_PROGRESS,
          status: 409,
          title: 'Checkout request already in progress',
          detail:
            'A concurrent checkout request with this Idempotency-Key is currently processing.',
        });
      }
      return {
        replayed: true,
        status: existing.responseStatus ?? 201,
        responseBody: existing.responseBody,
      };
    }
    throw err;
  }

  try {
    const txResult = await app.prisma.$transaction(
      async (tx) => {
        const cart = await tx.cart.findUnique({
          where: { userId },
          include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
        });

        if (!cart || cart.items.length === 0) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION_ERROR,
            status: 400,
            title: 'Empty cart',
            detail: 'Cannot checkout an empty cart.',
          });
        }

        const bikeReqMap = new Map();
        const accReqMap = new Map();
        const bikeByBundleGroup = new Map();

        for (const item of cart.items) {
          if (item.itemType === 'BIKE' && item.bikeId) {
            bikeReqMap.set(item.bikeId, (bikeReqMap.get(item.bikeId) ?? 0) + item.quantity);
            if (item.bundleGroupId) {
              bikeByBundleGroup.set(item.bundleGroupId, item.bikeId);
            }
          } else if (item.itemType === 'ACCESSORY' && item.accessoryId) {
            accReqMap.set(item.accessoryId, (accReqMap.get(item.accessoryId) ?? 0) + item.quantity);
          }
        }

        const sortedBikeIds = Array.from(bikeReqMap.keys()).sort();
        const sortedAccIds = Array.from(accReqMap.keys()).sort();

        // Deadlock-free locking: always lock bikes ASC, then accessories ASC
        const lockedBikes =
          sortedBikeIds.length > 0
            ? await tx.$queryRaw`
                SELECT id, sku, slug, name, price_vnd, deposit_amount_vnd, stock_qty, reserved_qty, status, deleted_at
                FROM bikes
                WHERE id IN (${Prisma.join(sortedBikeIds.map((id) => Prisma.sql`${id}::uuid`))})
                ORDER BY id ASC
                FOR UPDATE
              `
            : [];

        const lockedAccessories =
          sortedAccIds.length > 0
            ? await tx.$queryRaw`
                SELECT id, sku, slug, image_url, name, price_vnd, stock_qty, reserved_qty, status, deleted_at
                FROM accessories
                WHERE id IN (${Prisma.join(sortedAccIds.map((id) => Prisma.sql`${id}::uuid`))})
                ORDER BY id ASC
                FOR UPDATE
              `
            : [];

        const bikeMap = new Map(lockedBikes.map((b) => [b.id, b]));
        const accMap = new Map(lockedAccessories.map((a) => [a.id, a]));

        for (const bikeId of sortedBikeIds) {
          const row = bikeMap.get(bikeId);
          if (!row || row.deleted_at !== null || row.status !== 'ACTIVE') {
            throw new AppError({
              code: ERROR_CODES.NOT_FOUND,
              status: 404,
              title: 'Motorcycle unavailable',
              detail: `Motorcycle ${bikeId} is no longer available for purchase.`,
            });
          }
        }

        for (const accId of sortedAccIds) {
          const row = accMap.get(accId);
          if (!row || row.deleted_at !== null || row.status !== 'ACTIVE') {
            throw new AppError({
              code: ERROR_CODES.NOT_FOUND,
              status: 404,
              title: 'Accessory unavailable',
              detail: `Accessory ${accId} is no longer available for purchase.`,
            });
          }
        }

        // Inline Lazy Expiration before checking stock
        await reclaimExpiredReservationsInline(tx, {
          bikeIds: sortedBikeIds,
          accessoryIds: sortedAccIds,
          bikeMap,
          accMap,
        });

        const hasBike = sortedBikeIds.length > 0;
        const orderType =
          payload.orderType ?? (hasBike ? ORDER_TYPES.BIKE_DEPOSIT : ORDER_TYPES.ACCESSORY_ONLY);
        const paymentMethod = payload.paymentMethod ?? app.env.PAYMENT_DEFAULT_PROVIDER;

        if (
          paymentMethod === PAYMENT_METHODS.MOCK &&
          (app.env.NODE_ENV === 'production' || !app.env.ENABLE_MOCK_PAYMENT)
        ) {
          throw new AppError({
            code: ERROR_CODES.MOCK_PAYMENT_DISABLED,
            status: 403,
            title: 'Mock payment disabled',
            detail: 'Mock payment provider is disabled in this environment.',
          });
        }

        if (hasBike && orderType === ORDER_TYPES.ACCESSORY_ONLY) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION_ERROR,
            status: 400,
            title: 'Invalid orderType for motorcycle cart',
            detail: 'Cart contains motorcycles; orderType cannot be ACCESSORY_ONLY.',
          });
        }

        if (
          paymentMethod === PAYMENT_METHODS.COD &&
          (hasBike || orderType !== ORDER_TYPES.ACCESSORY_ONLY)
        ) {
          throw new AppError({
            code: ERROR_CODES.COD_NOT_ELIGIBLE,
            status: 422,
            title: 'COD is not eligible for motorcycle orders',
            detail:
              'Cash-On-Delivery (COD) is strictly prohibited for orders containing motorcycles.',
          });
        }

        // Check live stock after Lazy Expiration
        for (const [bikeId, reqQty] of bikeReqMap.entries()) {
          const row = bikeMap.get(bikeId);
          const available = Number(row.stock_qty) - Number(row.reserved_qty);
          if (available < reqQty) {
            throw new AppError({
              code: ERROR_CODES.INSUFFICIENT_STOCK,
              status: 409,
              title: 'Insufficient motorcycle stock',
              detail: `${row.name} only has ${Math.max(0, available)} unit(s) available, cannot reserve ${reqQty}.`,
              errors: [
                {
                  field: 'bikeId',
                  code: 'STOCK_EXCEEDED',
                  message: `Available stock is ${Math.max(0, available)}`,
                },
              ],
            });
          }
        }

        for (const [accId, reqQty] of accReqMap.entries()) {
          const row = accMap.get(accId);
          const available = Number(row.stock_qty) - Number(row.reserved_qty);
          if (available < reqQty) {
            throw new AppError({
              code: ERROR_CODES.INSUFFICIENT_STOCK,
              status: 409,
              title: 'Insufficient accessory stock',
              detail: `${row.name} only has ${Math.max(0, available)} unit(s) available, cannot reserve ${reqQty}.`,
              errors: [
                {
                  field: 'accessoryId',
                  code: 'STOCK_EXCEEDED',
                  message: `Available stock is ${Math.max(0, available)}`,
                },
              ],
            });
          }
        }

        // Authoritative compatibility labor & bike media snapshot lookup
        const [compatRows, bikeMediaRows] = await Promise.all([
          sortedBikeIds.length > 0 && sortedAccIds.length > 0
            ? tx.bikeAccessoryCompatibility.findMany({
                where: {
                  bikeId: { in: sortedBikeIds },
                  accessoryId: { in: sortedAccIds },
                },
                select: { bikeId: true, accessoryId: true, installLaborVnd: true },
              })
            : Promise.resolve([]),
          sortedBikeIds.length > 0
            ? tx.bikeMedia.findMany({
                where: {
                  bikeId: { in: sortedBikeIds },
                  deletedAt: null,
                },
                orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
                select: {
                  id: true,
                  bikeId: true,
                  url: true,
                  mediaType: true,
                  isPrimary: true,
                  sortOrder: true,
                  createdAt: true,
                },
              })
            : Promise.resolve([]),
        ]);

        const bikeMediaByBikeId = new Map();
        for (const row of bikeMediaRows) {
          const list = bikeMediaByBikeId.get(row.bikeId) ?? [];
          list.push(row);
          bikeMediaByBikeId.set(row.bikeId, list);
        }

        let subtotalBigInt = 0n;
        let installLaborTotalBigInt = 0n;
        let bikeDepositTotalBigInt = 0n;
        let accessoryWithLaborBigInt = 0n;
        const orderItemsData = [];

        for (const item of cart.items) {
          const qtyBigInt = BigInt(item.quantity);
          if (item.itemType === 'BIKE' && item.bikeId) {
            const bike = bikeMap.get(item.bikeId);
            const unitPriceBigInt = BigInt(bike.price_vnd);
            const depositBigInt = BigInt(bike.deposit_amount_vnd);
            const lineTotalBigInt = unitPriceBigInt * qtyBigInt;
            const resolvedBikeMedia = resolveBikeMedia(bikeMediaByBikeId.get(bike.id) ?? []);

            subtotalBigInt += lineTotalBigInt;
            bikeDepositTotalBigInt += depositBigInt * qtyBigInt;

            orderItemsData.push({
              itemType: 'BIKE',
              bikeId: bike.id,
              accessoryId: null,
              productNameSnapshot: bike.name,
              skuSnapshot: bike.sku,
              unitPriceVnd: unitPriceBigInt,
              installLaborVnd: 0n,
              quantity: item.quantity,
              lineTotalVnd: lineTotalBigInt,
              metadataJson: {
                ...(item.bundleGroupId ? { bundleGroupId: item.bundleGroupId } : {}),
                slug: bike.slug,
                productUrl: buildBikeProductUrl(bike.slug),
                imageUrl: resolvedBikeMedia.commercialImageUrl,
                imageKind: resolvedBikeMedia.commercialImageKind,
              },
            });
          } else if (item.itemType === 'ACCESSORY' && item.accessoryId) {
            const acc = accMap.get(item.accessoryId);
            let laborBigInt = 0n;
            if (item.bundleGroupId && bikeByBundleGroup.has(item.bundleGroupId)) {
              const bundleBikeId = bikeByBundleGroup.get(item.bundleGroupId);
              const compat = compatRows.find(
                (c) => c.bikeId === bundleBikeId && c.accessoryId === acc.id
              );
              if (compat) {
                laborBigInt = BigInt(compat.installLaborVnd ?? 0n);
              }
            }
            const unitPriceBigInt = BigInt(acc.price_vnd);
            const lineTotalBigInt = (unitPriceBigInt + laborBigInt) * qtyBigInt;
            const resolvedAccMedia = resolveAccessoryMedia({ imageUrl: acc.image_url });

            subtotalBigInt += unitPriceBigInt * qtyBigInt;
            installLaborTotalBigInt += laborBigInt * qtyBigInt;
            accessoryWithLaborBigInt += lineTotalBigInt;

            orderItemsData.push({
              itemType: 'ACCESSORY',
              bikeId: null,
              accessoryId: acc.id,
              productNameSnapshot: acc.name,
              skuSnapshot: acc.sku,
              unitPriceVnd: unitPriceBigInt,
              installLaborVnd: laborBigInt,
              quantity: item.quantity,
              lineTotalVnd: lineTotalBigInt,
              metadataJson: {
                ...(item.bundleGroupId ? { bundleGroupId: item.bundleGroupId } : {}),
                slug: acc.slug,
                productUrl: buildAccessoryProductUrl(acc.sku),
                imageUrl: resolvedAccMedia.imageUrl,
                imageKind: resolvedAccMedia.imageKind,
              },
            });
          }
        }

        const totalBigInt = subtotalBigInt + installLaborTotalBigInt;
        const depositRawBigInt = bikeDepositTotalBigInt + accessoryWithLaborBigInt;
        const payableNowBigInt =
          orderType === ORDER_TYPES.BIKE_DEPOSIT
            ? depositRawBigInt < totalBigInt
              ? depositRawBigInt
              : totalBigInt
            : totalBigInt;
        const remainingBalanceBigInt = totalBigInt - payableNowBigInt;

        if (
          paymentMethod === PAYMENT_METHODS.COD &&
          toSafeVndNumber(totalBigInt, 'totalVnd') > COD_MAX_AMOUNT_VND
        ) {
          throw new AppError({
            code: ERROR_CODES.COD_NOT_ELIGIBLE,
            status: 422,
            title: 'COD maximum exceeded',
            detail: `COD orders cannot exceed ${COD_MAX_AMOUNT_VND} VND.`,
          });
        }

        const isCod = paymentMethod === PAYMENT_METHODS.COD;
        const reservationExpiresAt = isCod
          ? null
          : new Date(Date.now() + app.env.RESERVATION_TTL_MINUTES * 60_000);

        if (isCod) {
          for (const [accId, reqQty] of accReqMap.entries()) {
            await tx.$executeRaw`
              UPDATE accessories
              SET stock_qty = stock_qty - ${reqQty}, version = version + 1
              WHERE id = ${accId}::uuid
            `;
          }
        } else {
          for (const [bikeId, reqQty] of bikeReqMap.entries()) {
            await tx.$executeRaw`
              UPDATE bikes
              SET reserved_qty = reserved_qty + ${reqQty}, version = version + 1
              WHERE id = ${bikeId}::uuid
            `;
          }
          for (const [accId, reqQty] of accReqMap.entries()) {
            await tx.$executeRaw`
              UPDATE accessories
              SET reserved_qty = reserved_qty + ${reqQty}, version = version + 1
              WHERE id = ${accId}::uuid
            `;
          }
        }

        const orderNumber = generateOrderNumber();
        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            userId,
            orderType,
            status: isCod ? ORDER_STATUSES.CONFIRMED : ORDER_STATUSES.PENDING_PAYMENT,
            paymentMethod,
            subtotalVnd: subtotalBigInt,
            installLaborTotalVnd: installLaborTotalBigInt,
            shippingFeeVnd: 0n,
            discountVnd: 0n,
            totalVnd: totalBigInt,
            payableNowVnd: payableNowBigInt,
            paidAmountVnd: 0n,
            remainingBalanceVnd: remainingBalanceBigInt,
            reservationExpiresAt,
            shippingAddressJson: payload.shippingAddress,
            riderFitSnapshotJson: payload.riderFitSnapshot ?? undefined,
            customerNote: payload.customerNote ?? null,
            items: {
              create: orderItemsData,
            },
          },
        });

        if (!isCod && reservationExpiresAt) {
          const reservations = [];
          for (const [bikeId, qty] of bikeReqMap.entries()) {
            reservations.push({
              orderId: createdOrder.id,
              itemType: 'BIKE',
              bikeId,
              quantity: qty,
              status: 'ACTIVE',
              expiresAt: reservationExpiresAt,
            });
          }
          for (const [accId, qty] of accReqMap.entries()) {
            reservations.push({
              orderId: createdOrder.id,
              itemType: 'ACCESSORY',
              accessoryId: accId,
              quantity: qty,
              status: 'ACTIVE',
              expiresAt: reservationExpiresAt,
            });
          }
          if (reservations.length > 0) {
            await tx.inventoryReservation.createMany({ data: reservations });
          }
        }

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

        await recordAuditLog(tx, {
          ...auditCtx,
          action: 'ORDER_CREATED',
          entityType: 'Order',
          entityId: createdOrder.id,
          beforeState: null,
          afterState: {
            orderNumber,
            orderType,
            paymentMethod,
            status: createdOrder.status,
            totalVnd: toSafeVndNumber(totalBigInt, 'totalVnd'),
            payableNowVnd: toSafeVndNumber(payableNowBigInt, 'payableNowVnd'),
          },
        });

        return {
          orderId: createdOrder.id,
          orderNumber,
          paymentMethod,
          payableNowVnd: toSafeVndNumber(payableNowBigInt, 'payableNowVnd'),
        };
      },
      { maxWait: 10_000, timeout: 15_000 }
    );

    const adapter = getPaymentAdapter(txResult.paymentMethod, app.env);
    const intent = await adapter.createPaymentIntent({
      order: {
        id: txResult.orderId,
        orderNumber: txResult.orderNumber,
        payableNowVnd: txResult.payableNowVnd,
      },
      returnUrl: payload.returnUrl,
      cancelUrl: payload.cancelUrl,
    });

    await app.prisma.paymentTransaction.create({
      data: {
        orderId: txResult.orderId,
        provider: txResult.paymentMethod,
        providerTxId: intent.providerTxId,
        checkoutUrl: intent.checkoutUrl,
        amountVnd: BigInt(txResult.payableNowVnd),
        status: 'INITIATED',
      },
    });

    const fullOrder = await findOrderById(app.prisma, txResult.orderId);
    const data = { order: fullOrder, payment: intent };

    await app.prisma.idempotencyKey.update({
      where: { id: claimedKeyId },
      data: {
        isProcessing: false,
        responseStatus: 201,
        responseBody: data,
      },
    });

    await invalidateCatalogCache(app);

    return {
      replayed: false,
      status: 201,
      data,
    };
  } catch (err) {
    if (claimedKeyId) {
      await app.prisma.idempotencyKey.deleteMany({
        where: { id: claimedKeyId, isProcessing: true },
      });
    }
    throw err;
  }
}

/**
 * List authenticated customer's own orders.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} userId
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function listMyOrders(app, userId, query) {
  return findOrdersPaginated(app.prisma, query, userId);
}

/**
 * Retrieve order detail enforcing IDOR ownership (owner or ADMIN/SALES_STAFF only).
 * @param {import('fastify').FastifyInstance} app
 * @param {object} authUser
 * @param {string} orderId
 * @returns {Promise<object>}
 */
export async function getOrderById(app, authUser, orderId) {
  const order = await findOrderById(app.prisma, orderId);
  if (!order) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Order not found',
      detail: `Order ${orderId} does not exist.`,
    });
  }

  const isPrivileged =
    authUser.role === USER_ROLES.ADMIN || authUser.role === USER_ROLES.SALES_STAFF;
  if (!isPrivileged && order.userId !== authUser.id) {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      status: 403,
      title: 'Access denied',
      detail: 'You do not have permission to view this order.',
    });
  }

  return order;
}

/**
 * Allow customer to cancel an owned PENDING_PAYMENT order and release held inventory.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} authUser
 * @param {string} orderId
 * @param {string|undefined} reason
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function cancelMyOrder(app, authUser, orderId, reason, auditCtx) {
  const cancelled = await app.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`
      SELECT id, user_id, status
      FROM orders
      WHERE id = ${orderId}::uuid AND deleted_at IS NULL
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Order not found',
        detail: `Order ${orderId} does not exist.`,
      });
    }

    if (
      row.user_id !== authUser.id &&
      authUser.role !== USER_ROLES.ADMIN &&
      authUser.role !== USER_ROLES.SALES_STAFF
    ) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        status: 403,
        title: 'Access denied',
        detail: 'You do not have permission to cancel this order.',
      });
    }

    if (row.status !== ORDER_STATUSES.PENDING_PAYMENT) {
      throw new AppError({
        code: ERROR_CODES.INVALID_ORDER_TRANSITION,
        status: 422,
        title: 'Order cannot be cancelled',
        detail: `Only PENDING_PAYMENT orders can be cancelled by customers (current status: ${row.status}).`,
      });
    }

    await releaseOrderReservations(tx, row.id);
    await tx.order.update({
      where: { id: row.id },
      data: {
        status: ORDER_STATUSES.CANCELLED,
        customerNote: reason ? `Cancelled: ${reason}` : undefined,
      },
    });

    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ORDER_CANCELLED',
      entityType: 'Order',
      entityId: row.id,
      beforeState: { status: row.status },
      afterState: { status: ORDER_STATUSES.CANCELLED, reason: reason ?? null },
    });

    return findOrderById(tx, row.id);
  });

  await invalidateCatalogCache(app);
  return cancelled;
}

/**
 * Admin/Sales paginated list of all orders.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function adminListOrders(app, query) {
  return findOrdersPaginated(app.prisma, query);
}

/**
 * Admin/Sales order status transition via Order State Machine with AuditLog.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} orderId
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminUpdateOrderStatus(app, orderId, payload, auditCtx) {
  const updated = await app.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw`
      SELECT id, status, internal_note
      FROM orders
      WHERE id = ${orderId}::uuid AND deleted_at IS NULL
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Order not found',
        detail: `Order ${orderId} does not exist.`,
      });
    }

    assertValidOrderTransition(row.status, payload.status);

    if (
      row.status === ORDER_STATUSES.PENDING_PAYMENT &&
      (payload.status === ORDER_STATUSES.CANCELLED || payload.status === ORDER_STATUSES.EXPIRED)
    ) {
      await releaseOrderReservations(tx, row.id);
    }

    await tx.order.update({
      where: { id: row.id },
      data: {
        status: payload.status,
        internalNote: payload.internalNote ?? row.internal_note,
      },
    });

    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'ORDER_STATUS_UPDATED',
      entityType: 'Order',
      entityId: row.id,
      beforeState: { status: row.status, internalNote: row.internal_note ?? null },
      afterState: { status: payload.status, internalNote: payload.internalNote ?? null },
    });

    return findOrderById(tx, row.id);
  });

  await invalidateCatalogCache(app);
  return updated;
}
