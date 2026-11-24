import { z } from 'zod';
import { ACCESSORY_CATEGORIES, PRODUCT_STATUSES } from '../enums.js';
import {
  PaginationQuerySchema,
  PositiveVndAmountSchema,
  SlugSchema,
  UuidSchema,
  VndAmountSchema,
} from './common.schema.js';

export const ErgoImpactSchema = z
  .object({
    loweringLinkMm: z.number().min(0).max(50).optional(),
    forkDropMm: z.number().min(0).max(15).optional(),
    lowSeatMm: z.number().min(0).max(45).optional(),
    seatWidthReductionMm: z.number().min(0).max(30).optional(),
    barRiserMm: z.number().min(0).max(50).optional(),
    barBackOffsetMm: z.number().min(-20).max(30).optional(),
    pegLowerMm: z.number().min(0).max(25).optional(),
    springRateRatio: z.number().min(0.7).max(1.4).optional(),
  })
  .strict();

export const AccessoryCreateSchema = z
  .object({
    sku: z.string().trim().min(2).max(64),
    name: z.string().trim().min(2).max(160),
    slug: SlugSchema,
    category: z.nativeEnum(ACCESSORY_CATEGORIES),
    brandName: z.string().trim().max(80).nullable().optional(),
    priceVnd: PositiveVndAmountSchema,
    stockQty: z.number().int().nonnegative().default(0),
    status: z.nativeEnum(PRODUCT_STATUSES).default(PRODUCT_STATUSES.ACTIVE),
    imageUrl: z.string().url().max(512).nullable().optional(),
    descriptionMd: z.string().max(15000).nullable().optional(),
    ergoImpactJson: ErgoImpactSchema.nullable().optional(),
  })
  .strict();

export const AccessoryUpdateSchema = AccessoryCreateSchema.omit({ sku: true, slug: true })
  .partial()
  .strict()
  .extend({
    version: z.number().int().positive().optional(),
  })
  .strict();

export const AccessoryFilterQuerySchema = PaginationQuerySchema.extend({
  category: z.nativeEnum(ACCESSORY_CATEGORIES).optional(),
  bikeId: UuidSchema.optional(),
  inStock: z.coerce.boolean().optional(),
  search: z.string().trim().max(120).optional(),
}).strict();

export const BikeCompatibilityItemSchema = z
  .object({
    accessoryId: UuidSchema,
    exactSeatDropMm: z.number().int().min(0).max(80).nullable().optional(),
    exactForkDropMm: z.number().int().min(0).max(25).nullable().optional(),
    requiresWorkshopInstall: z.boolean().default(false),
    installLaborVnd: VndAmountSchema.default(0),
    fitmentNotes: z.string().trim().max(300).nullable().optional(),
  })
  .strict();

export const BikeCompatibilitiesPutSchema = z
  .object({
    compatibilities: z.array(BikeCompatibilityItemSchema).max(100),
  })
  .strict();
