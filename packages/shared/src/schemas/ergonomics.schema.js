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
import { UuidSchema } from './common.schema.js';

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
  .strict();

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
