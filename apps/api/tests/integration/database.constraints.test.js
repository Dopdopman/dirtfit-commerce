import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateBikeFit } from '@dirtfit/ergonomics-engine';
import { SHOWROOM_CODES, mapMoneyFieldsToNumbers, toSafeVndNumber } from '@dirtfit/shared';

const prisma = new PrismaClient();

describe('Phase 2 Database Constraints, Seed Integrity & Engine Integration', () => {
  let seededBikes = [];
  let seededCustomer = null;

  beforeAll(async () => {
    seededBikes = await prisma.bike.findMany({
      where: { deletedAt: null },
      include: {
        brand: true,
        geometrySpec: true,
        compatibilities: {
          include: {
            accessory: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    seededCustomer = await prisma.user.findUnique({
      where: { email: 'rider@dirtfit.vn' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verifies idempotent seed baseline: 8 real-world bikes, 3 showrooms, and Argon2id users', async () => {
    expect(seededBikes.length).toBeGreaterThanOrEqual(8);

    const expectedBikeNames = [
      'Honda CRF150L',
      'Honda CRF300L',
      'Yamaha WR155R',
      'Kawasaki KLX230',
      'KTM 350 EXC-F',
      'Husqvarna FE 350',
      'Yamaha Ténéré 700',
      'Honda CRF250R',
    ];
    const actualNames = seededBikes.map((b) => b.name);
    for (const expectedName of expectedBikeNames) {
      expect(actualNames).toContain(expectedName);
    }

    const bookings = await prisma.testRideBooking.findMany({
      where: { bookingCode: { startsWith: 'TR-SEED-' } },
    });
    const showrooms = new Set(bookings.map((b) => b.showroomCode));
    expect(showrooms.has(SHOWROOM_CODES.HN_LONG_BIEN)).toBe(true);
    expect(showrooms.has(SHOWROOM_CODES.DN_SON_TRA)).toBe(true);
    expect(showrooms.has(SHOWROOM_CODES.HCM_THU_DUC)).toBe(true);

    expect(seededCustomer).not.toBeNull();
    const isPasswordValid = await argon2.verify(seededCustomer.passwordHash, 'Rider@DirtFit2026!');
    expect(isPasswordValid).toBe(true);
  });

  it('blocks negative stock, reserved_qty > stock_qty, and zero price via PostgreSQL CHECK constraints (23514)', async () => {
    const targetBike = seededBikes[0];

    let stockNegErr = null;
    try {
      await prisma.$executeRaw`UPDATE bikes SET stock_qty = -1 WHERE id = ${targetBike.id}::uuid`;
    } catch (err) {
      stockNegErr = err;
    }
    expect(stockNegErr).not.toBeNull();
    expect(stockNegErr.meta?.code).toBe('23514');

    let reservedOverflowErr = null;
    try {
      await prisma.$executeRaw`UPDATE bikes SET reserved_qty = stock_qty + 1 WHERE id = ${targetBike.id}::uuid`;
    } catch (err) {
      reservedOverflowErr = err;
    }
    expect(reservedOverflowErr).not.toBeNull();
    expect(reservedOverflowErr.meta?.code).toBe('23514');

    let zeroPriceErr = null;
    try {
      await prisma.$executeRaw`UPDATE bikes SET price_vnd = 0 WHERE id = ${targetBike.id}::uuid`;
    } catch (err) {
      zeroPriceErr = err;
    }
    expect(zeroPriceErr).not.toBeNull();
    expect(zeroPriceErr.meta?.code).toBe('23514');
  });

  it('blocks duplicate active test ride bookings via Partial Unique Index (23505) while allowing cancelled re-bookings', async () => {
    const targetBike = seededBikes[0];
    const testDate = new Date('2027-07-15T00:00:00.000Z');
    const createdIds = [];

    try {
      const first = await prisma.testRideBooking.create({
        data: {
          bookingCode: 'TR-TEST-CONFLICT-01',
          userId: seededCustomer.id,
          bikeId: targetBike.id,
          showroomCode: SHOWROOM_CODES.HCM_THU_DUC,
          scheduledDate: testDate,
          timeSlot: '09:00-10:30',
          licenseClass: 'A2',
          status: 'CONFIRMED',
        },
      });
      createdIds.push(first.id);

      let duplicateErr = null;
      try {
        await prisma.$executeRaw`
          INSERT INTO test_ride_bookings (id, booking_code, user_id, bike_id, showroom_code, scheduled_date, time_slot, license_class, status, updated_at)
          VALUES (
            gen_random_uuid(),
            'TR-TEST-CONFLICT-02',
            ${seededCustomer.id}::uuid,
            ${targetBike.id}::uuid,
            'HCM_THU_DUC'::"ShowroomCode",
            '2027-07-15'::date,
            '09:00-10:30',
            'A2',
            'PENDING'::"TestRideStatus",
            NOW()
          )
        `;
      } catch (err) {
        duplicateErr = err;
      }
      expect(duplicateErr).not.toBeNull();
      expect(duplicateErr.meta?.code).toBe('23505');

      // Cancelling the active slot frees it for a new booking
      await prisma.testRideBooking.update({
        where: { id: first.id },
        data: { status: 'CANCELLED' },
      });

      const rebooked = await prisma.testRideBooking.create({
        data: {
          bookingCode: 'TR-TEST-CONFLICT-03',
          userId: seededCustomer.id,
          bikeId: targetBike.id,
          showroomCode: SHOWROOM_CODES.HCM_THU_DUC,
          scheduledDate: testDate,
          timeSlot: '09:00-10:30',
          licenseClass: 'A2',
          status: 'PENDING',
        },
      });
      createdIds.push(rebooked.id);
      expect(rebooked.status).toBe('PENDING');
    } finally {
      if (createdIds.length > 0) {
        await prisma.testRideBooking.deleteMany({
          where: { id: { in: createdIds } },
        });
      }
    }
  });

  it('enforces single active primary SIDE_PROFILE_BLUEPRINT per bike while ignoring soft-deleted rows (23505)', async () => {
    const targetBike = seededBikes[0];
    const createdMediaIds = [];

    try {
      let dupBlueprintErr = null;
      try {
        await prisma.$executeRaw`
          INSERT INTO bike_media (id, bike_id, url, storage_key, media_type, is_primary, updated_at)
          VALUES (
            gen_random_uuid(),
            ${targetBike.id}::uuid,
            'https://cdn.dirtfit.vn/test-dup.png',
            'bikes/test/dup-blueprint.png',
            'SIDE_PROFILE_BLUEPRINT'::"MediaType",
            true,
            NOW()
          )
        `;
      } catch (err) {
        dupBlueprintErr = err;
      }
      expect(dupBlueprintErr).not.toBeNull();
      expect(dupBlueprintErr.meta?.code).toBe('23505');

      // Soft-deleted primary blueprint does NOT violate the partial unique index
      const softDeletedMedia = await prisma.bikeMedia.create({
        data: {
          bikeId: targetBike.id,
          url: 'https://cdn.dirtfit.vn/test-archived.png',
          storageKey: 'bikes/test/archived-blueprint.png',
          mediaType: 'SIDE_PROFILE_BLUEPRINT',
          isPrimary: true,
          deletedAt: new Date(),
        },
      });
      createdMediaIds.push(softDeletedMedia.id);
      expect(softDeletedMedia.deletedAt).not.toBeNull();
    } finally {
      if (createdMediaIds.length > 0) {
        await prisma.bikeMedia.deleteMany({
          where: { id: { in: createdMediaIds } },
        });
      }
    }
  });

  it('maps all 8 DB bikes BigInt -> Number safely and evaluates ergonomics-engine without NaN or JSON error', () => {
    const rider = {
      heightCm: 170,
      weightKg: 68,
      footwear: 'MX_BOOTS',
      ridingExperience: 'INTERMEDIATE',
      targetTerrain: 'OFF_ROAD',
    };

    const evaluatedPayload = seededBikes.map((bike) => {
      const mappedBike = mapMoneyFieldsToNumbers(bike, ['priceVnd', 'depositAmountVnd']);
      expect(typeof mappedBike.priceVnd).toBe('number');
      expect(typeof mappedBike.depositAmountVnd).toBe('number');
      expect(mappedBike.priceVnd).toBe(toSafeVndNumber(bike.priceVnd));

      const compatibleParts = bike.compatibilities.map((c) => ({
        id: c.accessory.id,
        name: c.accessory.name,
        category: c.accessory.category,
        priceVnd: toSafeVndNumber(c.accessory.priceVnd),
        installLaborVnd: toSafeVndNumber(c.installLaborVnd),
        ergoImpact: c.accessory.ergoImpactJson,
      }));

      const fit = evaluateBikeFit(rider, bike.geometrySpec, {}, compatibleParts);
      expect(Number.isFinite(fit.sag.effectiveSeatHeightMm)).toBe(true);
      expect(Number.isNaN(fit.sag.effectiveSeatHeightMm)).toBe(false);
      expect(fit.fitScore).toBeGreaterThanOrEqual(0);
      expect(fit.fitScore).toBeLessThanOrEqual(100);

      return {
        id: mappedBike.id,
        name: mappedBike.name,
        priceVnd: mappedBike.priceVnd,
        depositAmountVnd: mappedBike.depositAmountVnd,
        effectiveSeatHeightMm: fit.sag.effectiveSeatHeightMm,
        contactStatus: fit.footContact.contactStatus,
        fitScore: fit.fitScore,
      };
    });

    expect(evaluatedPayload).toHaveLength(8);
    const json = JSON.stringify(evaluatedPayload);
    expect(typeof json).toBe('string');
    expect(JSON.parse(json)).toHaveLength(8);
  });
});
