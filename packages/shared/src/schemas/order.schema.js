import { z } from 'zod';
import { ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS } from '../enums.js';
import { PaginationQuerySchema, UuidSchema } from './common.schema.js';
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
    orderId: UuidSchema.optional(),
    orderNumber: z.string().trim().min(4).max(32).optional(),
    outcome: z.enum(['SUCCEEDED', 'FAILED']).default('SUCCEEDED'),
    providerTxId: z.string().trim().min(4).max(128).optional(),
    amountVnd: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine((data) => Boolean(data.orderId || data.orderNumber), {
    message: 'Either orderId or orderNumber is required',
    path: ['orderId'],
  });

export const CheckoutOrderSchema = z
  .object({
    orderType: z.nativeEnum(ORDER_TYPES).optional(),
    paymentMethod: z.nativeEnum(PAYMENT_METHODS).optional(),
    shippingAddress: ShippingAddressSchema,
    riderFitSnapshot: RiderProfileInputSchema.optional(),
    customerNote: z.string().trim().max(500).optional(),
    returnUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .strict();

export const OrderListQuerySchema = PaginationQuerySchema.extend({
  status: z.nativeEnum(ORDER_STATUSES).optional(),
  orderType: z.nativeEnum(ORDER_TYPES).optional(),
  orderNumber: z.string().trim().max(32).optional(),
}).strict();

export const CancelOrderSchema = z
  .object({
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

export const PayOSWebhookPayloadSchema = z
  .object({
    code: z.string(),
    desc: z.string().optional(),
    success: z.boolean().optional(),
    data: z.record(z.unknown()),
    signature: z.string().min(16),
  })
  .strict();
