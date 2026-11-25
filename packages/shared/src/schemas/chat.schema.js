import { z } from 'zod';
import { CHAT_FEEDBACK, FOOTWEAR_TYPES } from '../enums.js';

export const ChatRiderProfileInputSchema = z
  .object({
    heightCm: z.coerce.number().min(135).max(220),
    weightKg: z.coerce.number().min(35).max(160),
    inseamCm: z.coerce.number().min(55).max(115).nullable().optional(),
    footwear: z.enum(Object.values(FOOTWEAR_TYPES)).optional(),
  })
  .strict();

export const SendChatMessageSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, 'Message cannot be empty')
      .max(1000, 'Message cannot exceed 1000 characters'),
    locale: z.enum(['en', 'vi']).default('en'),
    riderProfile: ChatRiderProfileInputSchema.optional(),
  })
  .strict();

export const ChatFeedbackSchema = z
  .object({
    feedback: z.enum(Object.values(CHAT_FEEDBACK)),
  })
  .strict();

export const ChatSessionQuerySchema = z
  .object({
    locale: z.enum(['en', 'vi']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const ChatMetricsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(90).default(7),
  })
  .strict();
