import { z } from 'zod';
import { MEDIA_TYPES } from '../enums.js';
import { UuidSchema } from './common.schema.js';

export const ALLOWED_MEDIA_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_MEDIA_UPLOAD_BYTES = 5 * 1024 * 1024;

export const MediaPresignSchema = z
  .object({
    bikeId: UuidSchema,
    mediaType: z.nativeEnum(MEDIA_TYPES).default(MEDIA_TYPES.GALLERY),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z.number().int().positive().max(MAX_MEDIA_UPLOAD_BYTES),
    originalFileName: z.string().trim().min(1).max(180).optional(),
  })
  .strict();

export const MediaConfirmSchema = z
  .object({
    bikeId: UuidSchema,
    storageKey: z.string().trim().min(10).max(255),
    declaredMimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    mediaType: z.nativeEnum(MEDIA_TYPES).default(MEDIA_TYPES.GALLERY),
    altText: z.string().trim().max(200).nullable().optional(),
    widthPx: z.number().int().positive().max(12000).nullable().optional(),
    heightPx: z.number().int().positive().max(12000).nullable().optional(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();
