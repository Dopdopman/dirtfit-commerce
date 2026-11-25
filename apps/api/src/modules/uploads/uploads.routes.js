import { z } from 'zod';
import {
  AccessoryMediaConfirmSchema,
  AccessoryMediaPresignSchema,
  AppError,
  BikeMediaConfirmBodySchema,
  BikeMediaPresignBodySchema,
  BikeMediaReorderSchema,
  ERROR_CODES,
  MediaConfirmSchema,
  MediaPresignSchema,
  USER_ROLES,
  UuidSchema,
} from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import { validateAnySafeStorageKey } from '../../common/storage/magic-bytes.js';
import {
  confirmAccessoryMediaUpload,
  confirmMediaUpload,
  createAccessoryMediaPresign,
  createMediaPresign,
  deleteAccessoryMedia,
  deleteBikeMedia,
  reorderBikeMedia,
  setBikePrimaryMedia,
} from './uploads.service.js';

const LocalUploadTokenParamSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{48}$/),
  })
  .strict();

const BikeIdParamSchema = z.object({ id: UuidSchema }).strict();
const BikeMediaParamSchema = z.object({ id: UuidSchema, mediaId: UuidSchema }).strict();
const AccessoryIdParamSchema = z.object({ id: UuidSchema }).strict();

/**
 * Media presigned upload, 4KB Magic Bytes confirmation, gallery lifecycle,
 * accessory photo uploads, and non-prod local mock storage endpoints.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function uploadsRoutes(app) {
  // Backward-compatible bike media presign & confirm aliases
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

  // Resource-scoped Motorcycle Real Photo & Blueprint lifecycle routes
  app.post(
    '/admin/bikes/:id/media/presign',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Generate presigned upload URL for a specific motorcycle media asset (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: BikeIdParamSchema,
        body: BikeMediaPresignBodySchema,
      },
    },
    async (request, reply) => {
      const presign = await createMediaPresign(app, {
        ...request.body,
        bikeId: request.params.id,
      });
      return sendSuccess(reply, presign, { status: 201 });
    }
  );

  app.post(
    '/admin/bikes/:id/media/confirm',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Confirm motorcycle media via 4KB Magic Bytes check (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: BikeIdParamSchema,
        body: BikeMediaConfirmBodySchema,
      },
    },
    async (request, reply) => {
      const result = await confirmMediaUpload(
        app,
        {
          ...request.body,
          bikeId: request.params.id,
        },
        buildAuditContext(request)
      );
      return sendSuccess(reply, result, { status: 201 });
    }
  );

  app.patch(
    '/admin/bikes/:id/media/:mediaId/primary',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary:
          'Set a BikeMedia asset as primary Cover Photo or primary Blueprint without cross-domain impact (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: BikeMediaParamSchema,
      },
    },
    async (request, reply) => {
      const result = await setBikePrimaryMedia(
        app,
        request.params.id,
        request.params.mediaId,
        buildAuditContext(request)
      );
      return sendSuccess(reply, result);
    }
  );

  app.patch(
    '/admin/bikes/:id/media/reorder',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Reorder active BikeMedia assets for a motorcycle (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: BikeIdParamSchema,
        body: BikeMediaReorderSchema,
      },
    },
    async (request, reply) => {
      const result = await reorderBikeMedia(
        app,
        request.params.id,
        request.body.orderedMediaIds,
        buildAuditContext(request)
      );
      return sendSuccess(reply, result);
    }
  );

  app.delete(
    '/admin/bikes/:id/media/:mediaId',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary:
          'Soft-delete a BikeMedia asset, auto-promote next cover photo, and purge storage object (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: BikeMediaParamSchema,
      },
    },
    async (request, reply) => {
      const result = await deleteBikeMedia(
        app,
        request.params.id,
        request.params.mediaId,
        buildAuditContext(request)
      );
      return sendSuccess(reply, result);
    }
  );

  // Accessory Product Photo Upload & Lifecycle routes (ADMIN only)
  app.post(
    '/admin/accessories/:id/media/presign',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Generate presigned upload URL for accessory product photo <= 5MB (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: AccessoryIdParamSchema,
        body: AccessoryMediaPresignSchema,
      },
    },
    async (request, reply) => {
      const presign = await createAccessoryMediaPresign(app, request.params.id, request.body);
      return sendSuccess(reply, presign, { status: 201 });
    }
  );

  app.post(
    '/admin/accessories/:id/media/confirm',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Confirm accessory product photo via 4KB Magic Bytes check (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: AccessoryIdParamSchema,
        body: AccessoryMediaConfirmSchema,
      },
    },
    async (request, reply) => {
      const result = await confirmAccessoryMediaUpload(
        app,
        request.params.id,
        request.body,
        buildAuditContext(request)
      );
      return sendSuccess(reply, result);
    }
  );

  app.delete(
    '/admin/accessories/:id/media',
    {
      preHandler: [app.requireAuth, app.requireRoles(USER_ROLES.ADMIN)],
      schema: {
        tags: ['Admin Media'],
        summary: 'Remove accessory photo and purge storage object best-effort (ADMIN only)',
        security: [{ bearerAuth: [] }],
        params: AccessoryIdParamSchema,
      },
    },
    async (request, reply) => {
      const result = await deleteAccessoryMedia(app, request.params.id, buildAuditContext(request));
      return sendSuccess(reply, result);
    }
  );

  // Scoped local binary upload & read-only preview (strictly unmounted in production)
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

      scoped.get(
        '/media/local/*',
        {
          schema: {
            tags: ['Admin Media'],
            summary: 'Serve verified local mock media image in non-production environments',
          },
        },
        async (request, reply) => {
          const rawKey = String(request.params['*'] ?? '').replace(/^\/+/, '');
          if (!validateAnySafeStorageKey(rawKey)) {
            throw new AppError({
              code: ERROR_CODES.INVALID_UPLOAD_FILE,
              status: 400,
              title: 'Invalid media storageKey',
              detail: 'Requested local media path does not match an authorized UUID image key.',
            });
          }

          if (typeof app.storage.getLocalObject !== 'function') {
            throw new AppError({
              code: ERROR_CODES.NOT_FOUND,
              status: 404,
              title: 'Local media unavailable',
              detail: 'Active storage adapter does not expose local object reads.',
            });
          }

          const obj = await app.storage.getLocalObject(rawKey);
          reply.header('Content-Type', obj.contentType);
          reply.header('X-Content-Type-Options', 'nosniff');
          reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
          reply.header('Cache-Control', 'public, max-age=60');
          return reply.send(obj.buffer);
        }
      );
    });
  }
}
