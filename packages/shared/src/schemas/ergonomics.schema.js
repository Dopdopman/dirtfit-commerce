import { z } from 'zod';
import { MOD_LIMITS, RIDER_LIMITS } from '@dirtfit/ergonomics-engine/constants';
import {
  BODY_PROPORTIONS,
  FOOTWEAR_TYPES,
  GENDERS,
  RIDING_EXPERIENCES,
  STANCE_MODES,
  TARGET_TERRAINS,
} from '../enums.js';
import { SlugSchema, UuidSchema } from './common.schema.js';

export const RiderProfileInputSchema = z
  .object({
    heightCm: z.number().min(RIDER_LIMITS.heightCm.min).max(RIDER_LIMITS.heightCm.max),
    weightKg: z.number().min(RIDER_LIMITS.weightKg.min).max(RIDER_LIMITS.weightKg.max),
    inseamCm: z
      .number()
      .min(RIDER_LIMITS.inseamCm.min)
      .max(RIDER_LIMITS.inseamCm.max)
      .nullable()
      .optional(),
    gender: z.nativeEnum(GENDERS).default(GENDERS.UNSPECIFIED),
    bodyProportion: z.nativeEnum(BODY_PROPORTIONS).default(BODY_PROPORTIONS.AVERAGE),
    footwear: z.nativeEnum(FOOTWEAR_TYPES).default(FOOTWEAR_TYPES.ADV_BOOTS),
    bootType: z.nativeEnum(FOOTWEAR_TYPES).optional(),
    gearWeightKg: z
      .number()
      .min(RIDER_LIMITS.gearWeightKg.min)
      .max(RIDER_LIMITS.gearWeightKg.max)
      .optional(),
    ridingExperience: z.nativeEnum(RIDING_EXPERIENCES).default(RIDING_EXPERIENCES.INTERMEDIATE),
    targetTerrain: z.nativeEnum(TARGET_TERRAINS).default(TARGET_TERRAINS.DUAL_SPORT),
    stanceMode: z.nativeEnum(STANCE_MODES).default(STANCE_MODES.SEATED_BOTH_FEET),
  })
  .strict();

export const BikeModificationsInputSchema = z
  .object({
    loweringLinkMm: z
      .number()
      .min(MOD_LIMITS.loweringLinkMm.min)
      .max(MOD_LIMITS.loweringLinkMm.max)
      .default(0),
    forkDropMm: z.number().min(MOD_LIMITS.forkDropMm.min).max(MOD_LIMITS.forkDropMm.max).default(0),
    lowSeatMm: z.number().min(MOD_LIMITS.lowSeatMm.min).max(MOD_LIMITS.lowSeatMm.max).default(0),
    seatWidthReductionMm: z
      .number()
      .min(MOD_LIMITS.seatWidthReductionMm.min)
      .max(MOD_LIMITS.seatWidthReductionMm.max)
      .default(0),
    barRiserMm: z.number().min(MOD_LIMITS.barRiserMm.min).max(MOD_LIMITS.barRiserMm.max).default(0),
    barBackOffsetMm: z
      .number()
      .min(MOD_LIMITS.barBackOffsetMm.min)
      .max(MOD_LIMITS.barBackOffsetMm.max)
      .default(0),
    pegLowerMm: z.number().min(MOD_LIMITS.pegLowerMm.min).max(MOD_LIMITS.pegLowerMm.max).default(0),
    springRateOverrideRatio: z
      .number()
      .min(MOD_LIMITS.springRateOverrideRatio.min)
      .max(MOD_LIMITS.springRateOverrideRatio.max)
      .default(1),
  })
  .strict();

const UvPointSchema = z
  .object({
    u: z.number().min(0).max(1),
    v: z.number().min(0).max(1),
  })
  .strict();

export const CalibrationDataSchema = z
  .object({
    version: z.literal(1).default(1),
    facing: z.enum(['RIGHT', 'LEFT']).default('RIGHT'),
    imageWidthPx: z.number().int().min(200).max(8000),
    imageHeightPx: z.number().int().min(200).max(8000),
    anchorsUv: z
      .object({
        rearAxle: UvPointSchema,
        frontAxle: UvPointSchema,
        groundLineV: z.number().min(0).max(1),
        seatPocket: UvPointSchema,
        footpeg: UvPointSchema,
        handlebarGrip: UvPointSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const { facing, anchorsUv } = data;
    const { rearAxle, frontAxle, groundLineV, seatPocket, footpeg, handlebarGrip } = anchorsUv;

    if (facing === 'RIGHT' && frontAxle.u - rearAxle.u < 0.08) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'frontAxle', 'u'],
        message: 'For RIGHT facing photos, frontAxle.u must be at least 0.08 ahead of rearAxle.u',
      });
    }
    if (facing === 'LEFT' && rearAxle.u - frontAxle.u < 0.08) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'frontAxle', 'u'],
        message: 'For LEFT facing photos, frontAxle.u must be at least 0.08 left of rearAxle.u',
      });
    }
    if (groundLineV <= rearAxle.v || groundLineV <= frontAxle.v) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'groundLineV'],
        message: 'groundLineV must sit vertically below both rearAxle.v and frontAxle.v',
      });
    }
    if (seatPocket.v >= groundLineV || seatPocket.v >= rearAxle.v) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'seatPocket', 'v'],
        message: 'seatPocket.v must sit vertically above rearAxle.v and groundLineV',
      });
    }
    if (footpeg.v >= groundLineV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'footpeg', 'v'],
        message: 'footpeg.v must sit vertically above groundLineV',
      });
    }
    if (handlebarGrip.v >= groundLineV) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'handlebarGrip', 'v'],
        message: 'handlebarGrip.v must sit vertically above groundLineV',
      });
    }

    const minAxleU = Math.min(rearAxle.u, frontAxle.u);
    const maxAxleU = Math.max(rearAxle.u, frontAxle.u);
    if (seatPocket.u <= minAxleU || seatPocket.u >= maxAxleU) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'seatPocket', 'u'],
        message: 'seatPocket.u must lie between rearAxle.u and frontAxle.u',
      });
    }
    if (footpeg.u <= minAxleU || footpeg.u >= maxAxleU) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['anchorsUv', 'footpeg', 'u'],
        message: 'footpeg.u must lie between rearAxle.u and frontAxle.u',
      });
    }
  });

export const SimulateEvaluateRequestSchema = z
  .object({
    bikeId: UuidSchema,
    riderProfile: RiderProfileInputSchema,
    accessoryIds: z.array(UuidSchema).max(10).default([]),
    customMods: BikeModificationsInputSchema.optional(),
  })
  .strict();

export const SimulateCompareRequestSchema = z
  .object({
    bikeIds: z.tuple([UuidSchema, UuidSchema]),
    riderProfile: RiderProfileInputSchema,
    alignmentMode: z.enum(['REAR_AXLE_GROUND', 'SEAT_POCKET']).default('REAR_AXLE_GROUND'),
    modsA: BikeModificationsInputSchema.optional(),
    modsB: BikeModificationsInputSchema.optional(),
  })
  .strict();

export const ErgonomicsSimulateRequestSchema = z
  .object({
    bikeId: UuidSchema.optional(),
    slug: SlugSchema.optional(),
    riderProfile: RiderProfileInputSchema.optional(),
    accessoryIds: z.array(UuidSchema).max(10).default([]),
    mods: BikeModificationsInputSchema.partial().strict().optional(),
    customMods: BikeModificationsInputSchema.partial().strict().optional(),
    heightCm: z.number().min(RIDER_LIMITS.heightCm.min).max(RIDER_LIMITS.heightCm.max).optional(),
    weightKg: z.number().min(RIDER_LIMITS.weightKg.min).max(RIDER_LIMITS.weightKg.max).optional(),
    inseamCm: z
      .number()
      .min(RIDER_LIMITS.inseamCm.min)
      .max(RIDER_LIMITS.inseamCm.max)
      .nullable()
      .optional(),
    gender: z.nativeEnum(GENDERS).optional(),
    bodyProportion: z.nativeEnum(BODY_PROPORTIONS).optional(),
    footwear: z.nativeEnum(FOOTWEAR_TYPES).optional(),
    bootType: z.nativeEnum(FOOTWEAR_TYPES).optional(),
    gearWeightKg: z
      .number()
      .min(RIDER_LIMITS.gearWeightKg.min)
      .max(RIDER_LIMITS.gearWeightKg.max)
      .optional(),
    ridingExperience: z.nativeEnum(RIDING_EXPERIENCES).optional(),
    targetTerrain: z.nativeEnum(TARGET_TERRAINS).optional(),
    stanceMode: z.nativeEnum(STANCE_MODES).optional(),
    loweringLinkMm: z
      .number()
      .min(MOD_LIMITS.loweringLinkMm.min)
      .max(MOD_LIMITS.loweringLinkMm.max)
      .optional(),
    forkDropMm: z.number().min(MOD_LIMITS.forkDropMm.min).max(MOD_LIMITS.forkDropMm.max).optional(),
    lowSeatMm: z.number().min(MOD_LIMITS.lowSeatMm.min).max(MOD_LIMITS.lowSeatMm.max).optional(),
    seatWidthReductionMm: z
      .number()
      .min(MOD_LIMITS.seatWidthReductionMm.min)
      .max(MOD_LIMITS.seatWidthReductionMm.max)
      .optional(),
    barRiserMm: z.number().min(MOD_LIMITS.barRiserMm.min).max(MOD_LIMITS.barRiserMm.max).optional(),
    barBackOffsetMm: z
      .number()
      .min(MOD_LIMITS.barBackOffsetMm.min)
      .max(MOD_LIMITS.barBackOffsetMm.max)
      .optional(),
    pegLowerMm: z.number().min(MOD_LIMITS.pegLowerMm.min).max(MOD_LIMITS.pegLowerMm.max).optional(),
    springRateOverrideRatio: z
      .number()
      .min(MOD_LIMITS.springRateOverrideRatio.min)
      .max(MOD_LIMITS.springRateOverrideRatio.max)
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.bikeId && !data.slug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bikeId'],
        message: 'Either bikeId or slug is required',
      });
    }
    if (!data.riderProfile && (data.heightCm === undefined || data.weightKg === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['riderProfile'],
        message: 'Provide riderProfile or both heightCm and weightKg',
      });
    }
  });

export const ErgonomicsCompareRequestSchema = z
  .object({
    bikeIds: z.tuple([UuidSchema, UuidSchema]).optional(),
    slugs: z.tuple([SlugSchema, SlugSchema]).optional(),
    riderProfile: RiderProfileInputSchema.optional(),
    heightCm: z.number().min(RIDER_LIMITS.heightCm.min).max(RIDER_LIMITS.heightCm.max).optional(),
    weightKg: z.number().min(RIDER_LIMITS.weightKg.min).max(RIDER_LIMITS.weightKg.max).optional(),
    inseamCm: z
      .number()
      .min(RIDER_LIMITS.inseamCm.min)
      .max(RIDER_LIMITS.inseamCm.max)
      .nullable()
      .optional(),
    gender: z.nativeEnum(GENDERS).optional(),
    bodyProportion: z.nativeEnum(BODY_PROPORTIONS).optional(),
    footwear: z.nativeEnum(FOOTWEAR_TYPES).optional(),
    bootType: z.nativeEnum(FOOTWEAR_TYPES).optional(),
    gearWeightKg: z
      .number()
      .min(RIDER_LIMITS.gearWeightKg.min)
      .max(RIDER_LIMITS.gearWeightKg.max)
      .optional(),
    ridingExperience: z.nativeEnum(RIDING_EXPERIENCES).optional(),
    targetTerrain: z.nativeEnum(TARGET_TERRAINS).optional(),
    stanceMode: z.nativeEnum(STANCE_MODES).optional(),
    alignmentMode: z.enum(['REAR_AXLE_GROUND', 'SEAT_POCKET']).default('REAR_AXLE_GROUND'),
    modsA: BikeModificationsInputSchema.partial().strict().optional(),
    modsB: BikeModificationsInputSchema.partial().strict().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.bikeIds && !data.slugs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bikeIds'],
        message: 'Either bikeIds or slugs tuple is required',
      });
    }
    if (data.bikeIds && data.bikeIds[0] === data.bikeIds[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bikeIds'],
        message: 'bikeIds must contain two distinct motorcycles',
      });
    }
    if (data.slugs && data.slugs[0] === data.slugs[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slugs'],
        message: 'slugs must contain two distinct motorcycles',
      });
    }
    if (!data.riderProfile && (data.heightCm === undefined || data.weightKg === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['riderProfile'],
        message: 'Provide riderProfile or both heightCm and weightKg',
      });
    }
  });
