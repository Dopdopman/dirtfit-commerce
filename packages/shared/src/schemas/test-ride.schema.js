import { z } from 'zod';
import { SHOWROOM_CODES, TEST_RIDE_STATUSES, TEST_RIDE_TIME_SLOTS } from '../enums.js';
import { UuidSchema } from './common.schema.js';
import { BikeModificationsInputSchema, RiderProfileInputSchema } from './ergonomics.schema.js';

const ShowroomEnum = z.nativeEnum(SHOWROOM_CODES);
const TimeSlotEnum = z.enum(TEST_RIDE_TIME_SLOTS);
const DateIsoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const TestRideAvailabilityQuerySchema = z
  .object({
    bikeId: UuidSchema,
    showroomCode: ShowroomEnum,
    date: DateIsoSchema,
  })
  .strict();

export const CreateTestRideSchema = z
  .object({
    bikeId: UuidSchema,
    showroomCode: ShowroomEnum,
    scheduledDate: DateIsoSchema,
    timeSlot: TimeSlotEnum,
    licenseClass: z.enum(['A1', 'A2']),
    riderProfileSnapshot: RiderProfileInputSchema.optional(),
    requestedMods: BikeModificationsInputSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const AdminUpdateTestRideSchema = z
  .object({
    status: z.nativeEnum(TEST_RIDE_STATUSES),
    assignedStaffId: UuidSchema.nullable().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
