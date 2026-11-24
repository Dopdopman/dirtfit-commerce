import { z } from 'zod';
import {
  AdminBikeFilterQuerySchema,
  BikeCreateSchema,
  BikeFilterQuerySchema,
  BikeUpdateSchema,
  CalibrationDataSchema,
  SlugSchema,
  USER_ROLES,
  UuidSchema,
} from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import {
  adminCalibrateBikeMedia,
  adminCreateBike,
  adminListBikes,
  adminSoftDeleteBike,
  adminUpdateBike,
  getPublicBikeBySlug,
  listBrands,
  listPublicBikes,
} from './catalog.service.js';

const SlugParamSchema = z.object({ slug: SlugSchema }).strict();
const IdParamSchema = z.object({ id: UuidSchema }).strict();
const CalibrationParamSchema = z
  .object({
    id: UuidSchema,
    mediaId: UuidSchema,
  })
  .strict();

/**
 * Catalog routes: Brands, Public Dual Filter + Smart Rider-Fit, Bike Detail, Admin CRUD & Calibration.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function catalogRoutes(app) {
  app.get(
    '/brands',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'List all motorcycle brands (cached)',
      },
    },
    async (_request, reply) => {
      const brands = await listBrands(app);
      return sendSuccess(reply, { brands });
    }
  );

  app.get(
    '/bikes',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'List active motorcycles with category/price and Smart Rider-Fit filters',
        querystring: BikeFilterQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await listPublicBikes(app, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.get(
    '/bikes/:slug',
    {
      schema: {
        tags: ['Catalog'],
        summary: 'Get public motorcycle detail by slug with geometry, media, and compatibilities',
        params: SlugParamSchema,
      },
    },
    async (request, reply) => {
      const bike = await getPublicBikeBySlug(app, request.params.slug);
      return sendSuccess(reply, { bike });
    }
  );

  app.get(
    '/admin/bikes',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Catalog'],
        summary: 'List motorcycles for Admin/Sales management',
        security: [{ bearerAuth: [] }],
        querystring: AdminBikeFilterQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await adminListBikes(app, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.post(
    '/admin/bikes',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Catalog'],
        summary: 'Create a motorcycle and BikeGeometrySpec with AuditLog (ADMIN only)',
        security: [{ bearerAuth: [] }],
        body: BikeCreateSchema,
      },
    },
    async (request, reply) => {
      const bike = await adminCreateBike(app, request.body, buildAuditContext(request));
      return sendSuccess(reply, { bike }, { status: 201 });
    }
  );

  app.patch(
    '/admin/bikes/:id',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Catalog'],
        summary:
          'Update motorcycle price, geometry, or stock (SALES_STAFF limited to stock/status)',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: BikeUpdateSchema,
      },
    },
    async (request, reply) => {
      const bike = await adminUpdateBike(
        app,
        request.params.id,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { bike });
    }
  );

  app.delete(
    '/admin/bikes/:id',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Catalog'],
        summary: 'Soft-delete a motorcycle with AuditLog and cache invalidation (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
      },
    },
    async (request, reply) => {
      const bike = await adminSoftDeleteBike(app, request.params.id, buildAuditContext(request));
      return sendSuccess(reply, { bike });
    }
  );

  app.patch(
    '/admin/bikes/:id/media/:mediaId/calibration',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Catalog'],
        summary: 'Save and validate UV blueprint calibration coordinates (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: CalibrationParamSchema,
        body: CalibrationDataSchema,
      },
    },
    async (request, reply) => {
      const result = await adminCalibrateBikeMedia(
        app,
        request.params.id,
        request.params.mediaId,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, result);
    }
  );
}
