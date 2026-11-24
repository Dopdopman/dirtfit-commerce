import { describe, expect, it } from 'vitest';
import {
  BikeCreateSchema,
  BikeFilterQuerySchema,
  CalibrationDataSchema,
  CartAddItemSchema,
  CreateOrderSchema,
  CreateTestRideSchema,
  MediaPresignSchema,
  MockWebhookSimulateSchema,
  RegisterSchema,
  RiderProfileInputSchema,
  SHOWROOM_CODES,
  buildProblemDetails,
} from '../src/index.js';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

describe('@dirtfit/shared strict Zod schemas & RFC 7807 builders', () => {
  it('rejects unknown fields via .strict() to prevent mass assignment', () => {
    const validReg = RegisterSchema.safeParse({
      email: 'Rider@Example.com',
      password: 'StrongPassword123',
      fullName: 'Nguyen Van A',
    });
    expect(validReg.success).toBe(true);
    expect(validReg.data.email).toBe('rider@example.com');

    const massAssignment = RegisterSchema.safeParse({
      email: 'rider@example.com',
      password: 'StrongPassword123',
      fullName: 'Nguyen Van A',
      role: 'ADMIN',
    });
    expect(massAssignment.success).toBe(false);
  });

  it('validates RiderProfileInputSchema bounds and rejects out-of-range inputs', () => {
    expect(
      RiderProfileInputSchema.safeParse({
        heightCm: 160,
        weightKg: 55,
        inseamCm: 73,
        footwear: 'MX_BOOTS',
      }).success
    ).toBe(true);

    expect(
      RiderProfileInputSchema.safeParse({
        heightCm: 120, // Below min 135
        weightKg: 55,
      }).success
    ).toBe(false);
  });

  it('validates CreateOrderSchema COD rules and strict payload checks', () => {
    const codOnBikeDeposit = CreateOrderSchema.safeParse({
      orderType: 'BIKE_DEPOSIT',
      paymentMethod: 'COD',
      shippingAddress: {
        recipientName: 'Tran Rider',
        phone: '0901234567',
        province: 'Ho Chi Minh',
        district: 'Thu Duc',
        streetAddress: '468 Xa Lo Ha Noi',
      },
    });
    expect(codOnBikeDeposit.success).toBe(false);

    const validMockDeposit = CreateOrderSchema.safeParse({
      orderType: 'BIKE_DEPOSIT',
      paymentMethod: 'MOCK',
      shippingAddress: {
        recipientName: 'Tran Rider',
        phone: '0901234567',
        province: 'Ho Chi Minh',
        district: 'Thu Duc',
        streetAddress: '468 Xa Lo Ha Noi',
      },
    });
    expect(validMockDeposit.success).toBe(true);

    expect(
      MockWebhookSimulateSchema.safeParse({
        orderId: VALID_UUID,
        outcome: 'SUCCEEDED',
      }).success
    ).toBe(true);
  });

  it('validates 3 canonical showrooms in CreateTestRideSchema', () => {
    for (const showroomCode of Object.values(SHOWROOM_CODES)) {
      expect(
        CreateTestRideSchema.safeParse({
          bikeId: VALID_UUID,
          showroomCode,
          scheduledDate: '2026-12-01',
          timeSlot: '09:00-10:30',
          licenseClass: 'A2',
        }).success
      ).toBe(true);
    }

    expect(
      CreateTestRideSchema.safeParse({
        bikeId: VALID_UUID,
        showroomCode: 'UNKNOWN_CITY',
        scheduledDate: '2026-12-01',
        timeSlot: '09:00-10:30',
        licenseClass: 'A2',
      }).success
    ).toBe(false);
  });

  it('validates BikeCreateSchema, CartAddItemSchema, and CalibrationDataSchema', () => {
    expect(
      CartAddItemSchema.safeParse({
        itemType: 'BIKE',
        bikeId: VALID_UUID,
        quantity: 1,
      }).success
    ).toBe(true);

    expect(
      CartAddItemSchema.safeParse({
        itemType: 'BIKE',
        bikeId: VALID_UUID,
        accessoryId: VALID_UUID_2,
        quantity: 1,
      }).success
    ).toBe(false);

    expect(
      CalibrationDataSchema.safeParse({
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1600,
        imageHeightPx: 1000,
        anchorsUv: {
          rearAxle: { u: 0.2, v: 0.7 },
          frontAxle: { u: 0.78, v: 0.7 },
          groundLineV: 0.91,
          seatPocket: { u: 0.43, v: 0.38 },
          footpeg: { u: 0.45, v: 0.7 },
          handlebarGrip: { u: 0.64, v: 0.26 },
        },
      }).success
    ).toBe(true);

    expect(
      BikeCreateSchema.safeParse({
        brandId: VALID_UUID,
        sku: 'KTM-350-EXCF-2026',
        name: 'KTM 350 EXC-F 2026',
        slug: 'ktm-350-exc-f-2026',
        modelYear: 2026,
        category: 'ENDURO',
        ridingFocus: 'OFF_ROAD',
        engineCc: 349,
        priceVnd: 359_000_000,
        depositAmountVnd: 25_000_000,
        stockQty: 3,
        geometrySpec: {
          unladenSeatHeightMm: 963,
          seatWidthMm: 145,
          wheelbaseMm: 1489,
          groundClearanceMm: 347,
          frontWheelDiameterIn: 21,
          rearWheelDiameterIn: 18,
          frontTireOuterRadiusMm: 358,
          rearTireOuterRadiusMm: 342,
          frontTravelMm: 300,
          rearTravelMm: 310,
          staticSagRearMm: 35,
          staticSagFrontMm: 26,
          seatPocketXMm: 565,
          seatPocketYMm: 963,
          footpegXMm: 620,
          footpegYMm: 410,
          handlebarGripXMm: 955,
          handlebarGripYMm: 1175,
          wetWeightKg: 111,
        },
      }).success
    ).toBe(true);
  });

  it('formats RFC 7807 Problem Details payload cleanly', () => {
    const problem = buildProblemDetails({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      title: 'Insufficient stock',
      detail: 'Only 1 unit available',
      instance: '/api/v1/orders',
      requestId: 'req_123',
      errors: [{ field: 'items[0].quantity', code: 'STOCK_EXCEEDED', message: 'Max 1' }],
    });

    expect(problem.type).toBe('https://api.dirtfit.vn/errors/INSUFFICIENT_STOCK');
    expect(problem.status).toBe(409);
    expect(problem.requestId).toBe('req_123');
    expect(problem.errors).toHaveLength(1);
  });

  it('rejects geometrically invalid UV calibration, unsafe upload MIME/size, and preserves boolean filter flags', () => {
    expect(
      CalibrationDataSchema.safeParse({
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1600,
        imageHeightPx: 1000,
        anchorsUv: {
          rearAxle: { u: 0.78, v: 0.7 },
          frontAxle: { u: 0.2, v: 0.7 },
          groundLineV: 0.91,
          seatPocket: { u: 0.43, v: 0.38 },
          footpeg: { u: 0.45, v: 0.7 },
          handlebarGrip: { u: 0.64, v: 0.26 },
        },
      }).success
    ).toBe(false);

    expect(
      CalibrationDataSchema.safeParse({
        version: 1,
        facing: 'RIGHT',
        imageWidthPx: 1600,
        imageHeightPx: 1000,
        anchorsUv: {
          rearAxle: { u: 0.2, v: 0.7 },
          frontAxle: { u: 0.78, v: 0.7 },
          groundLineV: 0.5,
          seatPocket: { u: 0.43, v: 0.38 },
          footpeg: { u: 0.45, v: 0.48 },
          handlebarGrip: { u: 0.64, v: 0.26 },
        },
      }).success
    ).toBe(false);

    expect(
      MediaPresignSchema.safeParse({
        bikeId: VALID_UUID,
        mimeType: 'image/png',
        sizeBytes: 2_000_000,
      }).success
    ).toBe(true);

    expect(
      MediaPresignSchema.safeParse({
        bikeId: VALID_UUID,
        mimeType: 'image/svg+xml',
        sizeBytes: 1024,
      }).success
    ).toBe(false);

    expect(
      MediaPresignSchema.safeParse({
        bikeId: VALID_UUID,
        mimeType: 'image/jpeg',
        sizeBytes: 6 * 1024 * 1024,
      }).success
    ).toBe(false);

    const parsedFilter = BikeFilterQuerySchema.parse({
      streetLegal: 'false',
      heightCm: '168',
      weightKg: '65',
      bootType: 'MX_BOOTS',
      fitFilter: 'FIT_WITH_MODS',
    });
    expect(parsedFilter.streetLegal).toBe(false);
    expect(parsedFilter.heightCm).toBe(168);
    expect(parsedFilter.bootType).toBe('MX_BOOTS');
  });
});
