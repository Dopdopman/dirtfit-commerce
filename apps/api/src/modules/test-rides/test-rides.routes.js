import { z } from 'zod';
import {
  AdminTestRideFilterQuerySchema,
  AdminUpdateTestRideSchema,
  CancelTestRideSchema,
  CreateTestRideSchema,
  TestRideAvailabilityQuerySchema,
  USER_ROLES,
  UuidSchema,
} from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import {
  adminListTestRides,
  adminUpdateTestRide,
  cancelMyTestRide,
  createTestRide,
  getTestRideSlots,
  listMyTestRides,
} from './test-rides.service.js';

const IdParamSchema = z.object({ id: UuidSchema }).strict();

/**
 * Showroom Test Ride Booking & Slot Availability routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function testRidesRoutes(app) {
  const slotsHandler = async (request, reply) => {
    const availability = await getTestRideSlots(app, request.query);
    return sendSuccess(reply, availability);
  };

  app.get(
    '/test-rides/slots',
    {
      schema: {
        tags: ['Test Rides'],
        summary: 'Check available showroom test-ride time slots for a motorcycle & date',
        querystring: TestRideAvailabilityQuerySchema,
      },
    },
    slotsHandler
  );

  app.get(
    '/test-rides/availability',
    {
      schema: {
        tags: ['Test Rides'],
        summary: 'Alias for GET /test-rides/slots',
        querystring: TestRideAvailabilityQuerySchema,
      },
    },
    slotsHandler
  );

  app.post(
    '/test-rides',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Test Rides'],
        summary: 'Book a showroom test ride (enforces active slot uniqueness via Partial Index)',
        security: [{ bearerAuth: [] }],
        body: CreateTestRideSchema,
      },
    },
    async (request, reply) => {
      const booking = await createTestRide(
        app,
        request.authUser.id,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { booking }, { status: 201 });
    }
  );

  app.get(
    '/test-rides/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Test Rides'],
        summary: 'List test ride bookings belonging to the authenticated user',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const bookings = await listMyTestRides(app, request.authUser.id);
      return sendSuccess(reply, { bookings });
    }
  );

  app.patch(
    '/test-rides/:id/cancel',
    {
      preHandler: [app.requireAuth],
      preValidation: async (request) => {
        if (request.body === undefined || request.body === null) {
          request.body = {};
        }
      },
      schema: {
        tags: ['Test Rides'],
        summary: 'Cancel an owned test ride booking (frees the active slot immediately)',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: CancelTestRideSchema,
      },
    },
    async (request, reply) => {
      const booking = await cancelMyTestRide(
        app,
        request.authUser,
        request.params.id,
        request.body?.notes,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { booking });
    }
  );

  app.get(
    '/admin/test-rides',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Test Rides'],
        summary: 'List all test ride bookings (ADMIN/SALES_STAFF)',
        security: [{ bearerAuth: [] }],
        querystring: AdminTestRideFilterQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await adminListTestRides(app, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.patch(
    '/admin/test-rides/:id',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN, USER_ROLES.SALES_STAFF)],
      schema: {
        tags: ['Admin Test Rides'],
        summary: 'Update test ride status or assign staff member with AuditLog',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: AdminUpdateTestRideSchema,
      },
    },
    async (request, reply) => {
      const booking = await adminUpdateTestRide(
        app,
        request.params.id,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, { booking });
    }
  );
}
