import crypto from 'node:crypto';
import { z } from 'zod';
import {
  CartAddBundleSchema,
  CartAddRequestSchema,
  CartUpdateItemSchema,
  UuidSchema,
} from '@dirtfit/shared';
import { sendSuccess } from '../../common/http/envelope.js';
import {
  addBundleToCart,
  addToCart,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from './cart.service.js';

export const GUEST_CART_COOKIE = 'df_guest_cart';

const ItemIdParamSchema = z.object({ itemId: UuidSchema }).strict();

/**
 * Resolve Cart owner from authenticated JWT user or guest cookie, issuing cookie if mutating as guest.
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {boolean} createGuestToken
 * @returns {{ userId: string|null, guestToken: string|null }}
 */
function resolveCartOwner(request, reply, createGuestToken = false) {
  if (request.authUser?.id) {
    return { userId: request.authUser.id, guestToken: null };
  }

  let guestToken = request.cookies?.[GUEST_CART_COOKIE] ?? null;
  if (!guestToken && createGuestToken) {
    guestToken = crypto.randomBytes(24).toString('hex');
    reply.setCookie(GUEST_CART_COOKIE, guestToken, {
      httpOnly: true,
      secure: request.server.env.COOKIE_SECURE,
      sameSite: request.server.env.COOKIE_SAME_SITE,
      path: '/api/v1',
      maxAge: 7 * 24 * 60 * 60,
    });
  }
  return { userId: null, guestToken };
}

/**
 * Persistent Shopping Cart & Simulator Combo Bundle routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function cartRoutes(app) {
  app.get(
    '/cart',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Cart'],
        summary: 'Get persistent cart with BigInt-safe VND totals and live availability',
      },
    },
    async (request, reply) => {
      const owner = resolveCartOwner(request, reply, false);
      const cart = await getCart(app, owner);
      return sendSuccess(reply, { cart });
    }
  );

  app.post(
    '/cart/items',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Cart'],
        summary: 'Add a motorcycle, accessory, or Simulator combo bundle to cart',
        body: CartAddRequestSchema,
      },
    },
    async (request, reply) => {
      const owner = resolveCartOwner(request, reply, true);
      const cart = await addToCart(app, owner, request.body);
      return sendSuccess(reply, { cart }, { status: 201 });
    }
  );

  app.post(
    '/cart/bundles',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Cart'],
        summary: 'Add motorcycle + compatible lowering/ergo accessories bundle to cart',
        body: CartAddBundleSchema,
      },
    },
    async (request, reply) => {
      const owner = resolveCartOwner(request, reply, true);
      const cart = await addBundleToCart(app, owner, request.body);
      return sendSuccess(reply, { cart }, { status: 201 });
    }
  );

  app.patch(
    '/cart/items/:itemId',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Cart'],
        summary: 'Update cart item quantity with live stock verification',
        params: ItemIdParamSchema,
        body: CartUpdateItemSchema,
      },
    },
    async (request, reply) => {
      const owner = resolveCartOwner(request, reply, false);
      const cart = await updateCartItem(app, owner, request.params.itemId, request.body.quantity);
      return sendSuccess(reply, { cart });
    }
  );

  app.delete(
    '/cart/items/:itemId',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Cart'],
        summary: 'Remove a single item from cart',
        params: ItemIdParamSchema,
      },
    },
    async (request, reply) => {
      const owner = resolveCartOwner(request, reply, false);
      const cart = await removeCartItem(app, owner, request.params.itemId);
      return sendSuccess(reply, { cart });
    }
  );

  app.delete(
    '/cart',
    {
      preHandler: [app.optionalAuth],
      schema: {
        tags: ['Cart'],
        summary: 'Clear all items in the active cart',
      },
    },
    async (request, reply) => {
      const owner = resolveCartOwner(request, reply, false);
      const cart = await clearCart(app, owner);
      return sendSuccess(reply, { cart });
    }
  );
}
