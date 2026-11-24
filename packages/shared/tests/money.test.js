import { describe, expect, it } from 'vitest';
import {
  COD_MAX_AMOUNT_VND,
  ERROR_CODES,
  MAX_SAFE_VND_BIGINT,
  ORDER_TYPES,
  calculateOrderTotals,
  formatVnd,
  mapMoneyFieldsToNumbers,
  toSafeVndNumber,
  toVndBigInt,
  validateCodEligibility,
} from '../src/index.js';

describe('@dirtfit/shared money & BigInt -> Number boundary helpers', () => {
  it('safely converts large VND BigInt values (e.g., 5_000_000_000n) to JS Number', () => {
    expect(toSafeVndNumber(0n)).toBe(0);
    expect(toSafeVndNumber(165_000_000n)).toBe(165_000_000);
    expect(toSafeVndNumber(5_000_000_000n)).toBe(5_000_000_000);
    expect(toSafeVndNumber(MAX_SAFE_VND_BIGINT)).toBe(Number.MAX_SAFE_INTEGER);
    expect(JSON.stringify({ totalVnd: toSafeVndNumber(5_000_000_000n) })).toBe(
      '{"totalVnd":5000000000}'
    );
  });

  it('throws VND_AMOUNT_OUT_OF_SAFE_RANGE when BigInt exceeds Number.MAX_SAFE_INTEGER', () => {
    const overMax = MAX_SAFE_VND_BIGINT + 1n;
    const underMin = -MAX_SAFE_VND_BIGINT - 1n;

    expect(() => toSafeVndNumber(overMax, 'priceVnd')).toThrowError(/Number\.MAX_SAFE_INTEGER/);
    try {
      toSafeVndNumber(overMax, 'priceVnd');
    } catch (err) {
      expect(err.code).toBe(ERROR_CODES.VND_AMOUNT_OUT_OF_SAFE_RANGE);
      expect(err.status).toBe(500);
    }

    expect(() => toSafeVndNumber(underMin, 'refundVnd')).toThrow();
  });

  it('rejects non-integer floats, NaN, and string inputs', () => {
    expect(() => toSafeVndNumber(12.5)).toThrow();
    expect(() => toSafeVndNumber(Number.NaN)).toThrow();
    expect(() => toSafeVndNumber('5000000000')).toThrow();
    expect(() => toVndBigInt('1000')).toThrow();
    expect(toVndBigInt(5_000_000_000)).toBe(5_000_000_000n);
    expect(toVndBigInt(5_000_000_000n)).toBe(5_000_000_000n);
  });

  it('maps Prisma BigInt fields to safe Numbers via mapMoneyFieldsToNumbers', () => {
    const prismaBikeRow = {
      id: 'b1',
      name: 'Yamaha Tenere 700',
      priceVnd: 399_000_000n,
      depositAmountVnd: 30_000_000n,
      stockQty: 2,
    };

    const mapped = mapMoneyFieldsToNumbers(prismaBikeRow, ['priceVnd', 'depositAmountVnd']);
    expect(mapped.priceVnd).toBe(399_000_000);
    expect(mapped.depositAmountVnd).toBe(30_000_000);
    expect(typeof mapped.priceVnd).toBe('number');
    expect(() => JSON.stringify(mapped)).not.toThrow();
    expect(mapMoneyFieldsToNumbers(null, ['priceVnd'])).toBeNull();
  });

  it('enforces COD eligibility rules strictly for ACCESSORY_ONLY <= 20M VND', () => {
    expect(
      validateCodEligibility({ orderType: ORDER_TYPES.BIKE_DEPOSIT, totalVnd: 5_000_000 }).eligible
    ).toBe(false);
    expect(
      validateCodEligibility({
        orderType: ORDER_TYPES.ACCESSORY_ONLY,
        totalVnd: COD_MAX_AMOUNT_VND + 1,
      }).eligible
    ).toBe(false);
    expect(
      validateCodEligibility({
        orderType: ORDER_TYPES.ACCESSORY_ONLY,
        totalVnd: COD_MAX_AMOUNT_VND,
      }).eligible
    ).toBe(true);
  });

  it('calculates BIKE_DEPOSIT and FULL_PURCHASE totals accurately and formats VND', () => {
    const totals = calculateOrderTotals({
      orderType: ORDER_TYPES.BIKE_DEPOSIT,
      shippingFeeVnd: 500_000,
      discountVnd: 0,
      items: [
        {
          itemType: 'BIKE',
          unitPriceVnd: 350_000_000n,
          depositAmountVnd: 20_000_000n,
          installLaborVnd: 0n,
          quantity: 1,
        },
        {
          itemType: 'ACCESSORY',
          unitPriceVnd: 3_200_000n,
          installLaborVnd: 450_000n,
          quantity: 1,
        },
      ],
    });

    expect(totals.subtotalVnd).toBe(353_200_000);
    expect(totals.installLaborTotalVnd).toBe(450_000);
    expect(totals.totalVnd).toBe(354_150_000);
    expect(totals.payableNowVnd).toBe(24_150_000);
    expect(totals.remainingBalanceVnd).toBe(330_000_000);
    expect(formatVnd(165_000_000n)).toContain('165.000.000');
  });
});
