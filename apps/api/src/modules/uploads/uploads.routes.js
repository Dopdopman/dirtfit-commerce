import { z } from 'zod';
import { MediaConfirmSchema, MediaPresignSchema, USER_ROLES } from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import { confirmMediaUpload, createMediaPresign } from './uploads.service.js';

const LocalUploadTokenParamSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{48}$/),
  })
  .strict();

/**
 * Media presigned upload, 4KB Magic Bytes confirmation, and non-prod local mock PUT receiver.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function uploadsRoutes(app) {
  app.post(
    '/admin/media/presign',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Generate presigned upload URL for JPEG/PNG/WebP bike media <= 5MB (ADMIN only)',
        security: [{ bearerAuth: [] }],
        body: MediaPresignSchema,
      },
    },
    async (request, reply) => {
      const presign = await createMediaPresign(app, request.body);
      return sendSuccess(reply, presign, { status: 201 });
    }
  );

  app.post(
    '/admin/media/confirm',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Verify uploaded media Magic Bytes (4KB head) and persist BikeMedia (ADMIN only)',
        security: [{ bearerAuth: [] }],
        body: MediaConfirmSchema,
      },
    },
    async (request, reply) => {
      const result = await confirmMediaUpload(app, request.body, buildAuditContext(request));
      return sendSuccess(reply, result, { status: 201 });
    }
  );

  // Scoped local binary upload receiver (only active in non-prod local driver mode)
  if (app.storage.driver === 'local' && app.env.NODE_ENV !== 'production') {
    await app.register(async function localUploadScope(scoped) {
      scoped.addContentTypeParser(
        [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/svg+xml',
          'text/html',
          'text/plain',
          'application/octet-stream',
        ],
        { parseAs: 'buffer', bodyLimit: 6 * 1024 * 1024 },
        (_req, body, done) => {
          done(null, body);
        }
      );

      scoped.put(
        '/admin/media/local-upload/:token',
        {
          schema: {
            tags: ['Admin Media'],
            summary: 'Local mock presigned PUT upload endpoint (development/test only)',
            params: LocalUploadTokenParamSchema,
          },
        },
        async (request, reply) => {
          const uploaded = await app.storage.receiveLocalUpload(
            request.params.token,
            request.body,
            request.headers['content-type'] ?? null
          );
          return sendSuccess(reply, uploaded);
        }
      );
    });
  }
}
