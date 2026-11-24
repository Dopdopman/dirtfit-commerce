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
