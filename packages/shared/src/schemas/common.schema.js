import { z } from 'zod';

export const UuidSchema = z.string().uuid();

export const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case');

export const VndAmountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const PositiveVndAmountSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const PaginationQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

export const SortDirectionSchema = z.enum(['asc', 'desc']).default('desc');

export const QueryBooleanSchema = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((val) => val === true || val === 'true' || val === '1');
