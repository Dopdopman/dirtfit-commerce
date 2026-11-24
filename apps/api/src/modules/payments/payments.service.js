import { Prisma } from '@prisma/client';
import {
  AppError,
  ERROR_CODES,
  ORDER_STATUSES,
  ORDER_TYPES,
  toSafeVndNumber,
} from '@dirtfit/shared';
import { invalidateCatalogCache } from '../../common/cache/catalog-cache.js';
import { recordAuditLog } from '../audit/audit.service.js';
import { findOrderById } from '../orders/orders.repository.js';
import { getPaymentAdapter } from './adapters/payment-adapter.registry.js';

/**
 * Verify webhook HMAC signature, enforce idempotent transaction processing,
 * commit stock_qty & reserved_qty atomically, and update Order status.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} params
 * @param {string} params.provider
 * @param {object} params.payload
 * @param {string} params.rawBody
 * @param {object} params.headers
 * @param {object} params.auditCtx
 * @returns {Promise<{ alreadyProcessed: boolean, latePaymentAfterExpiry?: boolean, order: object }>}
 */
export async function handlePaymentWebhook(app, { provider, payload, rawBody, headers, auditCtx }) {
  const adapter = getPaymentAdapter(provider, app.env);
  const verified = adapter.verifyAndParseWebhook({ payload, rawBody, headers });

  if (!verified.isValid) {
    throw new AppError({
      code: ERROR_CODES.INVALID_PAYMENT_SIGNATURE,
      status: 401,
      title: 'Invalid webhook signature',
      detail: `${provider} webhook signature verification failed.`,
    });
  }

  const result = await app.prisma.$transaction(
    async (tx) => {
      if (verified.providerTxId) {
        const existingTx = await tx.paymentTransaction.findUnique({
          where: { providerTxId: verified.providerTxId },
        });
        if (existingTx && existingTx.status === 'SUCCEEDED') {
          const order = await findOrderById(tx, existingTx.orderId);
          return { alreadyProcessed: true, order };
        }
      }

      const lockedOrders = verified.orderId
        ? await tx.$queryRaw`
            SELECT id, order_number, order_type, status, total_vnd, payable_now_vnd, paid_amount_vnd
            FROM orders
            WHERE id = ${verified.orderId}::uuid AND deleted_at IS NULL
            FOR UPDATE
          `
        : await tx.$queryRaw`
            SELECT id, order_number, order_type, status, total_vnd, payable_now_vnd, paid_amount_vnd
            FROM orders
            WHERE order_number = ${verified.orderNumber} AND deleted_at IS NULL
            FOR UPDATE
          `;

      const orderRow = lockedOrders[0];
      if (!orderRow) {
        throw new AppError({
          code: ERROR_CODES.NOT_FOUND,
          status: 404,
          title: 'Order not found',
          detail: 'Webhook referenced an unknown order.',
        });
      }

      if (
        orderRow.status === ORDER_STATUSES.DEPOSIT_PAID ||
        orderRow.status === ORDER_STATUSES.PAID
      ) {
        const existingOrder = await findOrderById(tx, orderRow.id);
        return { alreadyProcessed: true, order: existingOrder };
      }

      const expectedPayable = toSafeVndNumber(orderRow.payable_now_vnd, 'payableNowVnd');
      if (verified.amountVnd !== undefined && verified.amountVnd !== expectedPayable) {
        await recordAuditLog(tx, {
          ...auditCtx,
          action: 'PAYMENT_AMOUNT_MISMATCH',
          entityType: 'Order',
          entityId: orderRow.id,
          beforeState: { payableNowVnd: expectedPayable },
          afterState: {
            receivedAmountVnd: verified.amountVnd,
            providerTxId: verified.providerTxId,
          },
        });
        throw new AppError({
          code: ERROR_CODES.INVALID_PAYMENT_SIGNATURE,
          status: 400,
          title: 'Webhook amount mismatch',
          detail: `Expected ${expectedPayable} VND, received ${verified.amountVnd} VND.`,
        });
      }

      if (verified.outcome === 'FAILED') {
        await tx.paymentTransaction.create({
          data: {
            orderId: orderRow.id,
            provider,
            providerTxId: verified.providerTxId,
            amountVnd: BigInt(expectedPayable),
            status: 'FAILED',
            failureReason: 'Payment gateway reported transaction failure.',
            rawWebhookPayload: verified.rawPayload,
          },
        });
        return { alreadyProcessed: false, order: await findOrderById(tx, orderRow.id) };
      }

      // Guard late webhook arriving after Lazy Expiration or manual cancellation
      if (
        orderRow.status === ORDER_STATUSES.EXPIRED ||
        orderRow.status === ORDER_STATUSES.CANCELLED
      ) {
        await tx.paymentTransaction.create({
          data: {
            orderId: orderRow.id,
            provider,
            providerTxId: verified.providerTxId,
            amountVnd: BigInt(expectedPayable),
            status: 'SUCCEEDED',
            verifiedAt: new Date(),
            rawWebhookPayload: verified.rawPayload,
          },
        });
        await recordAuditLog(tx, {
          ...auditCtx,
          action: 'PAYMENT_RECEIVED_AFTER_EXPIRY',
          entityType: 'Order',
          entityId: orderRow.id,
          beforeState: { status: orderRow.status },
          afterState: { providerTxId: verified.providerTxId, amountVnd: expectedPayable },
        });
        return {
          alreadyProcessed: false,
          latePaymentAfterExpiry: true,
          order: await findOrderById(tx, orderRow.id),
        };
      }

      const items = await tx.orderItem.findMany({
        where: { orderId: orderRow.id },
      });

      const bikeQtyMap = new Map();
      const accQtyMap = new Map();
      for (const item of items) {
        if (item.itemType === 'BIKE' && item.bikeId) {
          bikeQtyMap.set(item.bikeId, (bikeQtyMap.get(item.bikeId) ?? 0) + item.quantity);
        } else if (item.itemType === 'ACCESSORY' && item.accessoryId) {
          accQtyMap.set(item.accessoryId, (accQtyMap.get(item.accessoryId) ?? 0) + item.quantity);
        }
      }

      const sortedBikeIds = Array.from(bikeQtyMap.keys()).sort();
      const sortedAccIds = Array.from(accQtyMap.keys()).sort();

      if (sortedBikeIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM bikes
          WHERE id IN (${Prisma.join(sortedBikeIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id ASC
          FOR UPDATE
        `;
        for (const bikeId of sortedBikeIds) {
          const qty = bikeQtyMap.get(bikeId);
          await tx.$executeRaw`
            UPDATE bikes
            SET stock_qty = GREATEST(0, stock_qty - ${qty}),
                reserved_qty = GREATEST(0, reserved_qty - ${qty}),
                version = version + 1
            WHERE id = ${bikeId}::uuid
          `;
        }
      }

      if (sortedAccIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM accessories
          WHERE id IN (${Prisma.join(sortedAccIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id ASC
          FOR UPDATE
        `;
        for (const accId of sortedAccIds) {
          const qty = accQtyMap.get(accId);
          await tx.$executeRaw`
            UPDATE accessories
            SET stock_qty = GREATEST(0, stock_qty - ${qty}),
                reserved_qty = GREATEST(0, reserved_qty - ${qty}),
                version = version + 1
            WHERE id = ${accId}::uuid
          `;
        }
      }

      await tx.inventoryReservation.updateMany({
        where: { orderId: orderRow.id, status: 'ACTIVE' },
        data: { status: 'COMMITTED', resolvedAt: new Date() },
      });

      const nextStatus =
        orderRow.order_type === ORDER_TYPES.BIKE_DEPOSIT
          ? ORDER_STATUSES.DEPOSIT_PAID
          : ORDER_STATUSES.PAID;
      const paidBigInt = BigInt(expectedPayable);
      const totalBigInt = BigInt(orderRow.total_vnd);
      const remainingBigInt = totalBigInt > paidBigInt ? totalBigInt - paidBigInt : 0n;

      await tx.order.update({
        where: { id: orderRow.id },
        data: {
          status: nextStatus,
          paidAmountVnd: paidBigInt,
          remainingBalanceVnd: remainingBigInt,
          reservationExpiresAt: null,
        },
      });

      await tx.paymentTransaction.upsert({
        where: { providerTxId: verified.providerTxId },
        update: {
          status: 'SUCCEEDED',
          verifiedAt: new Date(),
          rawWebhookPayload: verified.rawPayload,
        },
        create: {
          orderId: orderRow.id,
          provider,
          providerTxId: verified.providerTxId,
          amountVnd: paidBigInt,
          status: 'SUCCEEDED',
          verifiedAt: new Date(),
          rawWebhookPayload: verified.rawPayload,
        },
      });

      await recordAuditLog(tx, {
        ...auditCtx,
        action: 'PAYMENT_WEBHOOK_SUCCEEDED',
        entityType: 'Order',
        entityId: orderRow.id,
        beforeState: { status: orderRow.status, paidAmountVnd: Number(orderRow.paid_amount_vnd) },
        afterState: {
          status: nextStatus,
          paidAmountVnd: expectedPayable,
          providerTxId: verified.providerTxId,
        },
      });

      return {
        alreadyProcessed: false,
        order: await findOrderById(tx, orderRow.id),
      };
    },
    { maxWait: 10_000, timeout: 15_000 }
  );

  if (!result.alreadyProcessed) {
    await invalidateCatalogCache(app);
  }

  return result;
}
