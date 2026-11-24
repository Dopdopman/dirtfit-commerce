import { z } from 'zod';
import {
  CancelOrderSchema,
  CheckoutOrderSchema,
  OrderListQuerySchema,
  USER_ROLES,
  UpdateOrderStatusSchema,
  UuidSchema,
} from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import {
  adminListOrders,
  adminUpdateOrderStatus,
  cancelMyOrder,
  checkoutFromCart,
  getOrderById,
  listMyOrders,
} from './orders.service.js';

const IdParamSchema = z.object({ id: UuidSchema }).strict();

/**
 * Orders, Idempotent Checkout, IDOR-protected Order Lookup & Admin State Machine routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function ordersRoutes(app) {
  const checkoutHandler = async (request, reply) => {
    const rawKey = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    const result = await checkoutFromCart(
      app,
      request.authUser.id,
      idempotencyKey,
      request.body,
      buildAuditContext(request)
    );

    if (result.replayed) {
      return sendSuccess(reply, result.responseBody, { status: result.status });
    }
    return sendSuccess(reply, result.data, { status: result.status });
  };

  app.post(
    '/orders/checkout',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Orders'],
        summary: 'Idempotent cart checkout with sorted SELECT ... FOR UPDATE & Lazy Expiration',
        security: [{ bearerAuth: [] }],
        body: CheckoutOrderSchema,
      },
    },
    checkoutHandler
  );

  app.post(
    '/orders',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Orders'],
        summary: 'Alias for POST /orders/checkout',
        security: [{ bearerAuth: [] }],
        body: CheckoutOrderSchema,
      },
    },
    checkoutHandler
  );

  const listMineHandler = async (request, reply) => {
    const result = await listMyOrders(app, request.authUser.id, request.query);
    return sendSuccess(reply, result.items, { pagination: result.pagination });
  };

  app.get(
    '/orders',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Orders'],
        summary: 'List orders belonging to the authenticated user',
        security: [{ bearerAuth: [] }],
        querystring: OrderListQuerySchema,
      },
    },
    listMineHandler
  );

  app.get(
    '/orders/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Orders'],
        summary: 'Alias for GET /orders',
        security: [{ bearerAuth: [] }],
        querystring: OrderListQuerySchema,
      },
    },
    listMineHandler
  );

  app.get(
    '/orders/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Orders'],
        summary: 'Get order detail with strict IDOR ownership enforcement',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
      },
    },
    async (request, reply) => {
      const order = await getOrderById(app, request.authUser, request.params.id);
      return sendSuccess(reply, { order });
    }
  );

  app.post(
    '/orders/:id/cancel',
    {
      preHandler: [app.requireAuth],
      preValidation: async (request) => {
        if (request.body === undefined || request.body === null) {
          request.body = {};
        }
      },
      schema: {
        tags: ['Orders'],
        summary: 'Cancel an owned PENDING_PAYMENT order and release held inventory',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: CancelOrderSchema,
      },
    },
    async (request, reply) => {
      const order = await cancelMyOrder(
        app,
        request.authUser,
        request.params.id,
        request.body?.reason,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { order });
    }
  );

  app.get(
    '/admin/orders',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Orders'],
        summary: 'List all customer orders with status filters (ADMIN/SALES_STAFF)',
        security: [{ bearerAuth: [] }],
        querystring: OrderListQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await adminListOrders(app, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.patch(
    '/admin/orders/:id/status',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Orders'],
        summary: 'Transition order state via validated State Machine with AuditLog',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: UpdateOrderStatusSchema,
      },
    },
    async (request, reply) => {
      const order = await adminUpdateOrderStatus(
        app,
        request.params.id,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { order });
    }
  );
}
