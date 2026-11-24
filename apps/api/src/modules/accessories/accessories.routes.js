import { z } from 'zod';
import {
  AccessoryCreateSchema,
  AccessoryFilterQuerySchema,
  AccessoryUpdateSchema,
  AdminAccessoryFilterQuerySchema,
  BikeCompatibilitiesPutSchema,
  SlugSchema,
  USER_ROLES,
  UuidSchema,
} from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import {
  adminCreateAccessory,
  adminListAccessories,
  adminPutBikeCompatibilities,
  adminSoftDeleteAccessory,
  adminUpdateAccessory,
  getPublicAccessoryBySlug,
  listPublicAccessories,
} from './accessories.service.js';

const SlugParamSchema = z.object({ slug: SlugSchema }).strict();
const IdParamSchema = z.object({ id: UuidSchema }).strict();
const BikeIdParamSchema = z.object({ bikeId: UuidSchema }).strict();

/**
 * Accessories & Bike Compatibility Matrix routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function accessoriesRoutes(app) {
  app.get(
    '/accessories',
    {
      schema: {
        tags: ['Accessories'],
        summary: 'List active accessories filtered by category, bikeId, stock, or keyword',
        querystring: AccessoryFilterQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await listPublicAccessories(app, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.get(
    '/accessories/:slug',
    {
      schema: {
        tags: ['Accessories'],
        summary: 'Get public accessory details and compatible motorcycles by slug',
        params: SlugParamSchema,
      },
    },
    async (request, reply) => {
      const accessory = await getPublicAccessoryBySlug(app, request.params.slug);
      return sendSuccess(reply, { accessory });
    }
  );

  app.get(
    '/admin/accessories',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Accessories'],
        summary: 'List accessories for Admin/Sales management',
        security: [{ bearerAuth: [] }],
        querystring: AdminAccessoryFilterQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await adminListAccessories(app, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.post(
    '/admin/accessories',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Accessories'],
        summary: 'Create a new accessory with ergoImpactJson and AuditLog (ADMIN only)',
        security: [{ bearerAuth: [] }],
        body: AccessoryCreateSchema,
      },
    },
    async (request, reply) => {
      const accessory = await adminCreateAccessory(app, request.body, buildAuditContext(request));
      return sendSuccess(reply, { accessory }, { status: 201 });
    }
  );

  app.patch(
    '/admin/accessories/:id',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Accessories'],
        summary: 'Update accessory price, stock, or specs (SALES_STAFF limited to stock/status)',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: AccessoryUpdateSchema,
      },
    },
    async (request, reply) => {
      const accessory = await adminUpdateAccessory(
        app,
        request.params.id,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { accessory });
    }
  );

  app.delete(
    '/admin/accessories/:id',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Accessories'],
        summary: 'Soft-delete an accessory with AuditLog (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
      },
    },
    async (request, reply) => {
      const accessory = await adminSoftDeleteAccessory(
        app,
        request.params.id,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { accessory });
    }
  );

  app.put(
    '/admin/bikes/:bikeId/compatibilities',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Accessories'],
        summary:
          'Replace compatible accessories matrix for a motorcycle with AuditLog (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: BikeIdParamSchema,
        body: BikeCompatibilitiesPutSchema,
      },
    },
    async (request, reply) => {
      const compatibilities = await adminPutBikeCompatibilities(
        app,
        request.params.bikeId,
        request.body.compatibilities,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { bikeId: request.params.bikeId, compatibilities });
    }
  );
}
