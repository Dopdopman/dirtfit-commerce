import { mapMoneyFieldsToNumbers } from '@dirtfit/shared';

const TEST_RIDE_INCLUDE = {
  bike: {
    include: {
      brand: true,
    },
  },
  user: {
    select: { id: true, email: true, fullName: true, phone: true },
  },
  assignedStaff: {
    select: { id: true, email: true, fullName: true },
  },
};

/**
 * Map a Prisma TestRideBooking record into a JSON-safe DTO (converting bike BigInt VND fields).
 * @param {object} booking
 * @returns {object}
 */
export function mapTestRideBooking(booking) {
  const safeBike = booking.bike
    ? mapMoneyFieldsToNumbers(booking.bike, ['priceVnd', 'depositAmountVnd'])
    : null;

  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    userId: booking.userId,
    bikeId: booking.bikeId,
    assignedStaffId: booking.assignedStaffId ?? null,
    showroomCode: booking.showroomCode,
    scheduledDate:
      booking.scheduledDate instanceof Date
        ? booking.scheduledDate.toISOString().slice(0, 10)
        : String(booking.scheduledDate).slice(0, 10),
    timeSlot: booking.timeSlot,
    licenseClass: booking.licenseClass,
    riderProfileSnapshot: booking.riderProfileSnapshot ?? null,
    requestedModsJson: booking.requestedModsJson ?? null,
    status: booking.status,
    notes: booking.notes ?? null,
    createdAt:
      booking.createdAt instanceof Date ? booking.createdAt.toISOString() : booking.createdAt,
    updatedAt:
      booking.updatedAt instanceof Date ? booking.updatedAt.toISOString() : booking.updatedAt,
    bike: safeBike
      ? {
          id: safeBike.id,
          name: safeBike.name,
          slug: safeBike.slug,
          category: safeBike.category,
          priceVnd: safeBike.priceVnd,
          depositAmountVnd: safeBike.depositAmountVnd,
          brand: safeBike.brand ?? null,
        }
      : null,
    user: booking.user ?? null,
    assignedStaff: booking.assignedStaff ?? null,
  };
}

/**
 * Find active (PENDING/CONFIRMED) booked slots for a bike, showroom, and date.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} params
 * @param {string} params.bikeId
 * @param {string} params.showroomCode
 * @param {Date} params.scheduledDate
 * @returns {Promise<string[]>}
 */
export async function findActiveBookedSlots(prisma, { bikeId, showroomCode, scheduledDate }) {
  const rows = await prisma.testRideBooking.findMany({
    where: {
      bikeId,
      showroomCode,
      scheduledDate,
      status: { in: ['PENDING', 'CONFIRMED'] },
    },
    select: { timeSlot: true },
  });
  return rows.map((r) => r.timeSlot);
}

/**
 * Create a TestRideBooking record inside a transaction.
 * @param {import('@prisma/client').PrismaClient} tx
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function createTestRideBooking(tx, data) {
  const created = await tx.testRideBooking.create({
    data,
    include: TEST_RIDE_INCLUDE,
  });
  return mapTestRideBooking(created);
}

/**
 * Find a TestRideBooking by ID.
 * @param {import('@prisma/client').PrismaClient} prismaOrTx
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function findTestRideById(prismaOrTx, id) {
  const row = await prismaOrTx.testRideBooking.findUnique({
    where: { id },
    include: TEST_RIDE_INCLUDE,
  });
  return row ? mapTestRideBooking(row) : null;
}

/**
 * List test ride bookings belonging to a specific user.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function findTestRidesByUserId(prisma, userId) {
  const rows = await prisma.testRideBooking.findMany({
    where: { userId },
    orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
    include: TEST_RIDE_INCLUDE,
  });
  return rows.map(mapTestRideBooking);
}

/**
 * Query paginated test ride bookings for Admin/Sales management.
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {object} query
 * @returns {Promise<{ items: Array<object>, pagination: object }>}
 */
export async function findAdminTestRides(prisma, query) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 12;
  const where = {};

  if (query.status) where.status = query.status;
  if (query.showroomCode) where.showroomCode = query.showroomCode;
  if (query.bikeId) where.bikeId = query.bikeId;
  if (query.date) where.scheduledDate = new Date(`${query.date}T00:00:00.000Z`);

  const [totalItems, rows] = await Promise.all([
    prisma.testRideBooking.count({ where }),
    prisma.testRideBooking.findMany({
      where,
      orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: TEST_RIDE_INCLUDE,
    }),
  ]);

  return {
    items: rows.map(mapTestRideBooking),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };
}
