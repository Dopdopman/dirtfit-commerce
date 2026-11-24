import { z } from 'zod';
import { RIDER_LIMITS } from '@dirtfit/ergonomics-engine/constants';
import {
  BODY_PROPORTIONS,
  FOOTWEAR_TYPES,
  GENDERS,
  RIDING_EXPERIENCES,
  USER_ROLES,
} from '../enums.js';

export const RegisterSchema = z
  .object({
    email: z.string().trim().email().max(255).toLowerCase(),
    password: z.string().min(8).max(128),
    fullName: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/, 'Invalid phone number format')
      .optional(),
  })
  .strict();

export const LoginSchema = z
  .object({
    email: z.string().trim().email().max(255).toLowerCase(),
    password: z.string().min(1).max(128),
  })
  .strict();

export const ForgotPasswordSchema = z
  .object({
    email: z.string().trim().email().max(255).toLowerCase(),
  })
  .strict();

export const ResetPasswordSchema = z
  .object({
    token: z.string().min(16).max(256),
    newPassword: z.string().min(8).max(128),
  })
  .strict();

export const UpdateMeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/, 'Invalid phone number format')
      .nullable()
      .optional(),
  })
  .strict();

export const UserBodyProfileCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(80).default('Hồ sơ mặc định'),
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
      .default(7),
    ridingExperience: z.nativeEnum(RIDING_EXPERIENCES).default(RIDING_EXPERIENCES.INTERMEDIATE),
    isDefault: z.boolean().default(false),
  })
  .strict();

export const UserBodyProfileUpdateSchema = UserBodyProfileCreateSchema.partial().strict();

export const AdminUpdateUserRoleSchema = z
  .object({
    role: z.nativeEnum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.role !== undefined || data.isActive !== undefined, {
    message: 'At least one of role or isActive must be provided',
  });
