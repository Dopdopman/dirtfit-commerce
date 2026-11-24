import { z } from 'zod';
import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS } from '../enums.js';
import { UuidSchema } from './common.schema.js';
import { RiderProfileInputSchema } from './ergonomics.schema.js';

export const ShippingAddressSchema = z
  .object({
    recipientName: z.string().trim().min(2).max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{8,15}$/, 'Invalid phone number format'),
    province: z.string().trim().min(2).max(80),
    district: z.string().trim().min(2).max(80),
    ward: z.string().trim().min(1).max(80).optional(),
    streetAddress: z.string().trim().min(5).max(250),
  })
  .strict();

export const CreateOrderSchema = z
  .object({
    orderType: z.nativeEnum(ORDER_TYPES),
    paymentMethod: z.nativeEnum(PAYMENT_METHODS),
    shippingAddress: ShippingAddressSchema,
    riderFitSnapshot: RiderProfileInputSchema.optional(),
    customerNote: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !(
        data.paymentMethod === PAYMENT_METHODS.COD && data.orderType !== ORDER_TYPES.ACCESSORY_ONLY
      ),
    {
      message: 'COD is strictly restricted to ACCESSORY_ONLY orders',
      path: ['paymentMethod'],
    }
  );

export const UpdateOrderStatusSchema = z
  .object({
    status: z.nativeEnum(ORDER_STATUSES),
    internalNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export const MockWebhookSimulateSchema = z
  .object({
    orderId: UuidSchema,
    outcome: z.enum(['SUCCEEDED', 'FAILED']).default('SUCCEEDED'),
    providerTxId: z.string().trim().min(4).max(128).optional(),
  })
  .strict();
