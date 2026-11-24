import { z } from 'zod';
import { RIDER_LIMITS } from '@dirtfit/ergonomics-engine/constants';
import {
  BIKE_CATEGORIES,
  FOOTWEAR_TYPES,
  PRODUCT_STATUSES,
  RIDING_FOCUSES,
  SEAT_FOAM_FIRMNESS,
} from '../enums.js';
import {
  PaginationQuerySchema,
  PositiveVndAmountSchema,
  SlugSchema,
  UuidSchema,
  VndAmountSchema,
} from './common.schema.js';

export const BikeGeometrySpecSchema = z
  .object({
    unladenSeatHeightMm: z.number().int().min(500).max(1100),
    seatWidthMm: z.number().int().min(100).max(400),
    wheelbaseMm: z.number().int().min(1100).max(1800),
    groundClearanceMm: z.number().int().min(100).max(450),
    frontWheelDiameterIn: z.number().min(14).max(23),
    rearWheelDiameterIn: z.number().min(12).max(21),
    frontTireOuterRadiusMm: z.number().int().min(200).max(450),
    rearTireOuterRadiusMm: z.number().int().min(200).max(450),
    frontTravelMm: z.number().int().min(80).max(360),
    rearTravelMm: z.number().int().min(80).max(360),
    staticSagRearMm: z.number().int().min(5).max(80),
    staticSagFrontMm: z.number().int().min(5).max(80),
    targetRiderSagRatio: z.number().min(0.2).max(0.45).default(0.33),
    referenceRiderWeightKg: z.number().min(50).max(120).default(83),
    linkageProgressionAlpha: z.number().min(0.6).max(1.2).default(0.85),
    seatFoamFirmness: z.nativeEnum(SEAT_FOAM_FIRMNESS).default(SEAT_FOAM_FIRMNESS.MEDIUM),
    seatPocketXMm: z.number().int().min(200).max(1000),
    seatPocketYMm: z.number().int().min(500).max(1100),
    footpegXMm: z.number().int().min(250).max(1100),
    footpegYMm: z.number().int().min(150).max(550),
    handlebarGripXMm: z.number().int().min(600).max(1400),
    handlebarGripYMm: z.number().int().min(700).max(1500),
    rakeDeg: z.number().min(18).max(35).nullable().optional(),
    trailMm: z.number().min(60).max(180).nullable().optional(),
    wetWeightKg: z.number().min(50).max(320),
    fuelCapacityL: z.number().min(3).max(40).nullable().optional(),
    technicalSpecsJson: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export const BikeCreateSchema = z
  .object({
    brandId: UuidSchema,
    sku: z.string().trim().min(2).max(64),
    name: z.string().trim().min(2).max(160),
    slug: SlugSchema,
    modelYear: z.number().int().min(2000).max(2035),
    category: z.nativeEnum(BIKE_CATEGORIES),
    ridingFocus: z.nativeEnum(RIDING_FOCUSES),
    engineCc: z.number().int().min(49).max(2000),
    streetLegal: z.boolean().default(true),
    priceVnd: PositiveVndAmountSchema,
    depositAmountVnd: VndAmountSchema,
    stockQty: z.number().int().nonnegative().default(0),
    status: z.nativeEnum(PRODUCT_STATUSES).default(PRODUCT_STATUSES.DRAFT),
    shortSummary: z.string().trim().max(500).nullable().optional(),
    descriptionMd: z.string().max(20000).nullable().optional(),
    geometrySpec: BikeGeometrySpecSchema,
  })
  .strict()
  .refine((data) => data.depositAmountVnd <= data.priceVnd, {
    message: 'depositAmountVnd cannot exceed priceVnd',
    path: ['depositAmountVnd'],
  });

export const BikeUpdateSchema = z
  .object({
    brandId: UuidSchema.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    modelYear: z.number().int().min(2000).max(2035).optional(),
    category: z.nativeEnum(BIKE_CATEGORIES).optional(),
    ridingFocus: z.nativeEnum(RIDING_FOCUSES).optional(),
    engineCc: z.number().int().min(49).max(2000).optional(),
    streetLegal: z.boolean().optional(),
    priceVnd: PositiveVndAmountSchema.optional(),
    depositAmountVnd: VndAmountSchema.optional(),
    stockQty: z.number().int().nonnegative().optional(),
    version: z.number().int().positive().optional(),
    status: z.nativeEnum(PRODUCT_STATUSES).optional(),
    shortSummary: z.string().trim().max(500).nullable().optional(),
    descriptionMd: z.string().max(20000).nullable().optional(),
    geometrySpec: BikeGeometrySpecSchema.partial().strict().optional(),
  })
  .strict();

export const BikeFilterQuerySchema = PaginationQuerySchema.extend({
  category: z.nativeEnum(BIKE_CATEGORIES).optional(),
  ridingFocus: z.nativeEnum(RIDING_FOCUSES).optional(),
  brandSlug: SlugSchema.optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  streetLegal: z.coerce.boolean().optional(),
  search: z.string().trim().max(120).optional(),
  riderHeightCm: z.coerce
    .number()
    .min(RIDER_LIMITS.heightCm.min)
    .max(RIDER_LIMITS.heightCm.max)
    .optional(),
  riderWeightKg: z.coerce
    .number()
    .min(RIDER_LIMITS.weightKg.min)
    .max(RIDER_LIMITS.weightKg.max)
    .optional(),
  riderInseamCm: z.coerce
    .number()
    .min(RIDER_LIMITS.inseamCm.min)
    .max(RIDER_LIMITS.inseamCm.max)
    .optional(),
  footwear: z.nativeEnum(FOOTWEAR_TYPES).optional(),
  minFitStatus: z.enum(['FLAT_FOOT', 'BALLS_OF_FEET', 'TIP_TOE', 'ONE_FOOT_SHIFT']).optional(),
  includeModdable: z.coerce.boolean().default(false),
}).strict();
