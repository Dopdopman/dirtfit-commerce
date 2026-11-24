import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AppError,
  ERROR_CODES,
  SHOWROOMS,
  TEST_RIDE_STATUSES,
  TEST_RIDE_TIME_SLOTS,
  USER_ROLES,
} from '@dirtfit/shared';
import { recordAuditLog } from '../audit/audit.service.js';
import {
  createTestRideBooking,
  findActiveBookedSlots,
  findAdminTestRides,
  findTestRideById,
  findTestRidesByUserId,
  mapTestRideBooking,
} from './test-rides.repository.js';

/**
 * Generate a unique test ride booking code (e.g. TR-20261125-AB12).
 * @returns {string}
 */
function generateBookingCode() {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `TR-${datePart}-${rand}`;
}

/**
 * Return available vs booked test ride time slots for a motorcycle at a showroom and date.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<object>}
 */
export async function getTestRideSlots(app, query) {
  const bike = await app.prisma.bike.findFirst({
    where: { id: query.bikeId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
  });

  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Active motorcycle ${query.bikeId} does not exist.`,
    });
  }

  const scheduledDate = new Date(`${query.date}T00:00:00.000Z`);
  const booked = await findActiveBookedSlots(app.prisma, {
    bikeId: query.bikeId,
    showroomCode: query.showroomCode,
    scheduledDate,
  });
  const bookedSet = new Set(booked);

  const slots = TEST_RIDE_TIME_SLOTS.map((timeSlot) => ({
    timeSlot,
    available: !bookedSet.has(timeSlot),
  }));

  return {
    bike,
    showroom: SHOWROOMS.find((s) => s.code === query.showroomCode) ?? null,
    showroomCode: query.showroomCode,
    date: query.date,
    slots,
    availableSlots: slots.filter((s) => s.available).map((s) => s.timeSlot),
  };
}

/**
 * Book an active test ride slot (uniqueness enforced atomically via uq_test_ride_slot_active).
 * @param {import('fastify').FastifyInstance} app
 * @param {string} userId
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function createTestRide(app, userId, payload, auditCtx) {
  const bike = await app.prisma.bike.findFirst({
    where: { id: payload.bikeId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true, name: true },
  });

  if (!bike) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Motorcycle not found',
      detail: `Active motorcycle ${payload.bikeId} does not exist.`,
    });
  }

  const scheduledDate = new Date(`${payload.scheduledDate}T00:00:00.000Z`);

  try {
    return await app.prisma.$transaction(async (tx) => {
      const booking = await createTestRideBooking(tx, {
        bookingCode: generateBookingCode(),
        userId,
        bikeId: payload.bikeId,
        showroomCode: payload.showroomCode,
        scheduledDate,
        timeSlot: payload.timeSlot,
        licenseClass: payload.licenseClass,
        riderProfileSnapshot: payload.riderProfileSnapshot ?? undefined,
        requestedModsJson: payload.requestedMods ?? undefined,
        status: TEST_RIDE_STATUSES.PENDING,
        notes: payload.notes ?? null,
      });

      await recordAuditLog(tx, {
        ...auditCtx,
        action: 'TEST_RIDE_BOOKED',
        entityType: 'TestRideBooking',
        entityId: booking.id,
        beforeState: null,
        afterState: {
          bookingCode: booking.bookingCode,
          bikeId: booking.bikeId,
          showroomCode: booking.showroomCode,
          scheduledDate: booking.scheduledDate,
          timeSlot: booking.timeSlot,
        },
      });

      return booking;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError({
        code: ERROR_CODES.TEST_RIDE_SLOT_TAKEN,
        status: 409,
        title: 'Test ride slot already booked',
        detail: `${bike.name} at ${payload.showroomCode} on ${payload.scheduledDate} (${payload.timeSlot}) is already reserved.`,
      });
    }
    throw err;
  }
}

/**
 * List test ride bookings owned by the authenticated customer.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function listMyTestRides(app, userId) {
  return findTestRidesByUserId(app.prisma, userId);
}

/**
 * Allow customer (owner only) or Admin/Sales to cancel an active test ride booking.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} authUser
 * @param {string} bookingId
 * @param {string|undefined} notes
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function cancelMyTestRide(app, authUser, bookingId, notes, auditCtx) {
  const existing = await findTestRideById(app.prisma, bookingId);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Test ride booking not found',
      detail: `Booking ${bookingId} does not exist.`,
    });
  }

  const isPrivileged =
    authUser.role === USER_ROLES.ADMIN || authUser.role === USER_ROLES.SALES_STAFF;
  if (!isPrivileged && existing.userId !== authUser.id) {
    throw new AppError({
      code: ERROR_CODES.FORBIDDEN,
      status: 403,
      title: 'Access denied',
      detail: 'You do not have permission to cancel this test ride booking.',
    });
  }

  if (
    existing.status !== TEST_RIDE_STATUSES.PENDING &&
    existing.status !== TEST_RIDE_STATUSES.CONFIRMED
  ) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION_ERROR,
      status: 422,
      title: 'Booking cannot be cancelled',
      detail: `Bookings in status ${existing.status} cannot be cancelled.`,
    });
  }

  return app.prisma.$transaction(async (tx) => {
    const updated = await tx.testRideBooking.update({
      where: { id: bookingId },
      data: {
        status: TEST_RIDE_STATUSES.CANCELLED,
        notes: notes ?? existing.notes,
      },
      include: {
        bike: { include: { brand: true } },
        user: { select: { id: true, email: true, fullName: true, phone: true } },
        assignedStaff: { select: { id: true, email: true, fullName: true } },
      },
    });

    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'TEST_RIDE_CANCELLED',
      entityType: 'TestRideBooking',
      entityId: bookingId,
      beforeState: { status: existing.status },
      afterState: { status: TEST_RIDE_STATUSES.CANCELLED },
    });

    return mapTestRideBooking(updated);
  });
}

/**
 * List test ride bookings for Admin/Sales management.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function adminListTestRides(app, query) {
  return findAdminTestRides(app.prisma, query);
}

/**
 * Update test ride booking status or assigned staff member (ADMIN/SALES_STAFF) with AuditLog.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} bookingId
 * @param {object} payload
 * @param {object} auditCtx
 * @returns {Promise<object>}
 */
export async function adminUpdateTestRide(app, bookingId, payload, auditCtx) {
  const existing = await findTestRideById(app.prisma, bookingId);
  if (!existing) {
    throw new AppError({
      code: ERROR_CODES.NOT_FOUND,
      status: 404,
      title: 'Test ride booking not found',
      detail: `Booking ${bookingId} does not exist.`,
    });
  }

  if (payload.assignedStaffId) {
    const staff = await app.prisma.user.findFirst({
      where: {
        id: payload.assignedStaffId,
        deletedAt: null,
        role: { in: [USER_ROLES.SALES_STAFF, USER_ROLES.ADMIN] },
      },
      select: { id: true },
    });
    if (!staff) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        status: 404,
        title: 'Staff member not found',
        detail: `Assigned staff user ${payload.assignedStaffId} does not exist.`,
      });
    }
  }

  return app.prisma.$transaction(async (tx) => {
    const updated = await tx.testRideBooking.update({
      where: { id: bookingId },
      data: {
        status: payload.status,
        assignedStaffId:
          payload.assignedStaffId !== undefined
            ? payload.assignedStaffId
            : existing.assignedStaffId,
        notes: payload.notes !== undefined ? payload.notes : existing.notes,
      },
      include: {
        bike: { include: { brand: true } },
        user: { select: { id: true, email: true, fullName: true, phone: true } },
        assignedStaff: { select: { id: true, email: true, fullName: true } },
      },
    });

    await recordAuditLog(tx, {
      ...auditCtx,
      action: 'TEST_RIDE_STATUS_UPDATED',
      entityType: 'TestRideBooking',
      entityId: bookingId,
      beforeState: {
        status: existing.status,
        assignedStaffId: existing.assignedStaffId,
      },
      afterState: {
        status: payload.status,
        assignedStaffId: updated.assignedStaffId,
      },
    });

    return mapTestRideBooking(updated);
  });
}
