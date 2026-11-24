import { z } from 'zod';
import { PaginationQuerySchema, USER_ROLES, UuidSchema } from '@dirtfit/shared';
import { sendSuccess } from '../../common/http/envelope.js';
import { listAuditLogs } from './audit.service.js';

const AuditLogQuerySchema = PaginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(48).optional(),
  actorId: UuidSchema.optional(),
}).strict();

/**
 * Admin Audit Log routes.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function auditRoutes(app) {
  app.get(
    '/admin/audit-logs',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Audit'],
        summary: 'Query immutable admin and security audit logs (ADMIN only)',
        security: [{ bearerAuth: [] }],
        querystring: AuditLogQuerySchema,
      },
    },
    async (request, reply) => {
      const result = await listAuditLogs(app.prisma, request.query);
      return sendSuccess(reply, result.items, { pagination: result.pagination });
    }
  );
}
