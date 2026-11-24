import { z } from 'zod';
import { ITEM_TYPES } from '../enums.js';
import { UuidSchema } from './common.schema.js';

export const CartAddItemSchema = z
  .object({
    itemType: z.nativeEnum(ITEM_TYPES),
    bikeId: UuidSchema.optional(),
    accessoryId: UuidSchema.optional(),
    quantity: z.number().int().min(1).max(20).default(1),
  })
  .strict()
  .refine(
    (data) =>
      (data.itemType === ITEM_TYPES.BIKE && Boolean(data.bikeId) && !data.accessoryId) ||
      (data.itemType === ITEM_TYPES.ACCESSORY && Boolean(data.accessoryId) && !data.bikeId),
    {
      message: 'BIKE item requires bikeId only; ACCESSORY item requires accessoryId only',
    }
  );

export const CartAddBundleSchema = z
  .object({
    bikeId: UuidSchema,
    accessoryIds: z.array(UuidSchema).min(1).max(8),
  })
  .strict();

export const CartUpdateItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(20),
  })
  .strict();

export const CartAddRequestSchema = z
  .object({
    itemType: z.nativeEnum(ITEM_TYPES).optional(),
    bikeId: UuidSchema.optional(),
    accessoryId: UuidSchema.optional(),
    accessoryIds: z.array(UuidSchema).min(1).max(8).optional(),
    quantity: z.number().int().min(1).max(20).default(1),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Array.isArray(data.accessoryIds)) {
      if (!data.bikeId || data.accessoryId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bikeId'],
          message: 'Combo cart add requires bikeId and accessoryIds without singular accessoryId',
        });
      }
      return;
    }

    const validBike =
      data.itemType === ITEM_TYPES.BIKE && Boolean(data.bikeId) && !data.accessoryId;
    const validAccessory =
      data.itemType === ITEM_TYPES.ACCESSORY && Boolean(data.accessoryId) && !data.bikeId;
    if (!validBike && !validAccessory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itemType'],
        message: 'BIKE item requires bikeId only; ACCESSORY item requires accessoryId only',
      });
    }
  });
