import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { invalidateCatalogCache } from '../../common/cache/catalog-cache.js';
import { recordAuditLog } from '../audit/audit.service.js';

/**
 * Constant-time comparison of the incoming X-Cron-Secret header against configured CRON_HMAC_SECRET.
 * @param {unknown} providedSecret
 * @param {string|undefined} expectedSecret
 * @returns {boolean}
 */
export function verifyCronSecret(providedSecret, expectedSecret) {
  if (
    typeof providedSecret !== 'string' ||
    typeof expectedSecret !== 'string' ||
    providedSecret.length === 0 ||
    expectedSecret.length === 0
  ) {
    return false;
  }

  const providedBuf = Buffer.from(providedSecret, 'utf8');
  const expectedBuf = Buffer.from(expectedSecret, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Sweep expired ACTIVE inventory reservations using FOR UPDATE SKIP LOCKED
 * and transition stale PENDING_PAYMENT orders to EXPIRED.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} auditCtx
 * @returns {Promise<{ sweptReservations: number, expiredOrders: number }>}
 */
export async function sweepExpiredReservations(app, auditCtx) {
  const result = await app.prisma.$transaction(
    async (tx) => {
      const expiredRows = await tx.$queryRaw`
        SELECT id, order_id, item_type, bike_id, accessory_id, quantity
        FROM inventory_reservations
        WHERE status = 'ACTIVE'
          AND expires_at <= NOW()
        ORDER BY id ASC
        LIMIT 200
        FOR UPDATE SKIP LOCKED
      `;

      if (expiredRows.length === 0) {
        return { sweptReservations: 0, expiredOrders: 0 };
      }

      const bikeTotals = new Map();
      const accTotals = new Map();
      const orderIds = new Set();

      for (const row of expiredRows) {
        orderIds.add(row.order_id);
        if (row.item_type === 'BIKE' && row.bike_id) {
          bikeTotals.set(row.bike_id, (bikeTotals.get(row.bike_id) ?? 0) + Number(row.quantity));
        }
        if (row.item_type === 'ACCESSORY' && row.accessory_id) {
          accTotals.set(
            row.accessory_id,
            (accTotals.get(row.accessory_id) ?? 0) + Number(row.quantity)
          );
        }
      }

      const sortedBikeIds = Array.from(bikeTotals.keys()).sort();
      const sortedAccIds = Array.from(accTotals.keys()).sort();

      if (sortedBikeIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM bikes
          WHERE id IN (${Prisma.join(sortedBikeIds.map((id) => Prisma.sql`${id}::uuid`))})
          ORDER BY id ASC
          FOR UPDATE
        `;
        for (const bikeId of sortedBikeIds) {
          const releaseQty = bikeTotals.get(bikeId);
          await tx.$executeRaw`
            UPDATE bikes
            SET reserved_qty = GREATEST(0, reserved_qty - ${releaseQty}), version = version + 1
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
          const releaseQty = accTotals.get(accId);
          await tx.$executeRaw`
            UPDATE accessories
            SET reserved_qty = GREATEST(0, reserved_qty - ${releaseQty}), version = version + 1
            WHERE id = ${accId}::uuid
          `;
        }
      }

      const resIds = expiredRows.map((r) => r.id);
      await tx.$executeRaw`
        UPDATE inventory_reservations
        SET status = 'EXPIRED', resolved_at = NOW()
        WHERE id IN (${Prisma.join(resIds.map((id) => Prisma.sql`${id}::uuid`))})
      `;

      const orderIdList = Array.from(orderIds).sort();
      let expiredOrders = 0;
      if (orderIdList.length > 0) {
        expiredOrders = await tx.$executeRaw`
          UPDATE orders o
          SET status = 'EXPIRED', updated_at = NOW()
          WHERE o.id IN (${Prisma.join(orderIdList.map((id) => Prisma.sql`${id}::uuid`))})
            AND o.status = 'PENDING_PAYMENT'
            AND NOT EXISTS (
              SELECT 1 FROM inventory_reservations r
              WHERE r.order_id = o.id
                AND r.status = 'ACTIVE'
                AND r.expires_at > NOW()
            )
        `;
      }

      await recordAuditLog(tx, {
        ...auditCtx,
        action: 'RESERVATIONS_SWEPT',
        entityType: 'InventoryReservation',
        entityId: 'sweeper-batch',
        beforeState: null,
        afterState: {
          sweptReservations: expiredRows.length,
          expiredOrders: Number(expiredOrders),
        },
      });

      return {
        sweptReservations: expiredRows.length,
        expiredOrders: Number(expiredOrders),
      };
    },
    { maxWait: 10_000, timeout: 15_000 }
  );

  if (result.sweptReservations > 0) {
    await invalidateCatalogCache(app);
  }

  return result;
}
