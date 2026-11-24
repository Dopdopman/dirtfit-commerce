import { z } from 'zod';
import {
  AdminUpdateUserRoleSchema,
  PaginationQuerySchema,
  USER_ROLES,
  UpdateMeSchema,
  UserBodyProfileCreateSchema,
  UserBodyProfileUpdateSchema,
  UuidSchema,
} from '@dirtfit/shared';
import { sendSuccess } from '../../common/http/envelope.js';
import {
  adminListUsers,
  adminUpdateUserRole,
  createMyBodyProfile,
  deleteMyBodyProfile,
  getMyBodyProfiles,
  getMyProfile,
  updateMyBodyProfile,
  updateMyProfile,
} from './users.service.js';

const IdParamSchema = z.object({ id: UuidSchema }).strict();

const AdminUsersQuerySchema = PaginationQuerySchema.extend({
  role: z.nativeEnum(USER_ROLES).optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().trim().max(120).optional(),
}).strict();

/**
 * Users & Rider Body Profiles routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function usersRoutes(app) {
  app.get(
    '/users/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Users'],
        summary: 'Get authenticated user profile and body profiles',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = await getMyProfile(app.prisma, request.authUser.id);
      return sendSuccess(reply, { user });
    }
  );

  app.patch(
    '/users/me',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Users'],
        summary: 'Update authenticated user profile fields',
        security: [{ bearerAuth: [] }],
        body: UpdateMeSchema,
      },
    },
    async (request, reply) => {
      const user = await updateMyProfile(app.prisma, request.authUser.id, request.body);
      return sendSuccess(reply, { user });
    }
  );

  app.get(
    '/users/me/body-profiles',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Users'],
        summary: 'List saved rider body profiles',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const profiles = await getMyBodyProfiles(app.prisma, request.authUser.id);
      return sendSuccess(reply, { profiles });
    }
  );

  app.post(
    '/users/me/body-profiles',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Users'],
        summary: 'Create a rider body profile (auto-estimates inseam if omitted)',
        security: [{ bearerAuth: [] }],
        body: UserBodyProfileCreateSchema,
      },
    },
    async (request, reply) => {
      const profile = await createMyBodyProfile(app.prisma, request.authUser.id, request.body);
      return sendSuccess(reply, { profile }, { status: 201 });
    }
  );

  app.patch(
    '/users/me/body-profiles/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Users'],
        summary: 'Update an owned rider body profile',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: UserBodyProfileUpdateSchema,
      },
    },
    async (request, reply) => {
      const profile = await updateMyBodyProfile(
        app.prisma,
        request.authUser.id,
        request.params.id,
        request.body
      );
      return sendSuccess(reply, { profile });
    }
  );

  app.delete(
    '/users/me/body-profiles/:id',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['Users'],
        summary: 'Delete an owned rider body profile',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
      },
    },
    async (request, reply) => {
      await deleteMyBodyProfile(app.prisma, request.authUser.id, request.params.id);
      return reply.code(204).send();
    }
  );

  app.get(
    '/admin/users',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Users'],
        summary: 'List users with role and activity filters (ADMIN only)',
        security: [{ bearerAuth: [] }],
        querystring: AdminUsersQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await adminListUsers(app.prisma, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );

  app.patch(
    '/admin/users/:id/role',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Users'],
        summary: 'Update user role or active status with AuditLog (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: IdParamSchema,
        body: AdminUpdateUserRoleSchema,
      },
    },
    async (request, reply) => {
      const user = await adminUpdateUserRole(app.prisma, request.params.id, request.body, {
        actorId: request.authUser.id,
        actorRole: request.authUser.role,
        ipAddress: request.ip,
        userAgent:
          typeof request.headers['user-agent'] === 'string'
            ? request.headers['user-agent'].slice(0, 512)
            : null,
        requestId: String(request.id),
      });
      return sendSuccess(reply, { user });
    }
  );
}
