import { COD_MAX_AMOUNT_VND, ORDER_TYPES } from './enums.js';
import { AppError, ERROR_CODES } from './errors.js';

export const MAX_SAFE_VND_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
export const MIN_SAFE_VND_BIGINT = -MAX_SAFE_VND_BIGINT;

/**
 * Convert a PostgreSQL/Prisma BigInt (or safe JS integer) to a JSON-safe JS Number.
 * Throws if BigInt exceeds JS safe integer bounds (~9 quadrillion VND).
 * @param {bigint|number} value
 * @param {string} [fieldName]
 * @returns {number}
 */
export function toSafeVndNumber(value, fieldName = 'amountVnd') {
  if (typeof value === 'bigint') {
    if (value > MAX_SAFE_VND_BIGINT || value < MIN_SAFE_VND_BIGINT) {
      throw new AppError({
        code: ERROR_CODES.VND_AMOUNT_OUT_OF_SAFE_RANGE,
        status: 500,
        title: 'VND amount exceeds JS safe integer range',
        detail: `${fieldName} (${value.toString()}) exceeds Number.MAX_SAFE_INTEGER.`,
      });
    }
    return Number(value);
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new AppError({
        code: ERROR_CODES.INVALID_VND_AMOUNT,
        status: 400,
        title: 'Invalid VND integer amount',
        detail: `${fieldName} must be a safe integer.`,
      });
    }
    return value;
  }

  throw new AppError({
    code: ERROR_CODES.INVALID_VND_AMOUNT,
    status: 400,
    title: 'Invalid VND amount type',
    detail: `${fieldName} must be a bigint or safe integer number.`,
  });
}

/**
 * Convert a JS safe integer or BigInt into BigInt for Prisma PostgreSQL BIGINT writes.
 * @param {bigint|number} value
 * @param {string} [fieldName]
 * @returns {bigint}
 */
export function toVndBigInt(value, fieldName = 'amountVnd') {
  if (typeof value === 'bigint') {
    if (value > MAX_SAFE_VND_BIGINT || value < MIN_SAFE_VND_BIGINT) {
      throw new AppError({
        code: ERROR_CODES.VND_AMOUNT_OUT_OF_SAFE_RANGE,
        status: 400,
        title: 'VND amount exceeds safe integer range',
        detail: `${fieldName} (${value.toString()}) exceeds safe bounds.`,
      });
    }
    return value;
  }

  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  throw new AppError({
    code: ERROR_CODES.INVALID_VND_AMOUNT,
    status: 400,
    title: 'Invalid VND integer amount',
    detail: `${fieldName} must be a safe integer or bigint.`,
  });
}

/**
 * Clone a Prisma record and convert specified BigInt currency fields to safe JS Numbers.
 * Mandatory Repository/Mapper boundary helper preventing BigInt JSON serialization errors.
 * @template {object} T
 * @param {T|null|undefined} record
 * @param {string[]} fields
 * @returns {T|null|undefined}
 */
export function mapMoneyFieldsToNumbers(record, fields) {
  if (!record || typeof record !== 'object') {
    return record;
  }
  const mapped = { ...record };
  for (const field of fields) {
    if (mapped[field] !== undefined && mapped[field] !== null) {
      mapped[field] = toSafeVndNumber(mapped[field], field);
    }
  }
  return mapped;
}

/**
 * Format a VND integer amount for storefront UI display.
 * @param {bigint|number} amount
 * @returns {string}
 */
export function formatVnd(amount) {
  const safeNum = toSafeVndNumber(amount, 'amount');
  return `${new Intl.NumberFormat('vi-VN').format(safeNum)} ₫`;
}

/**
 * Check whether Cash-On-Delivery (COD) is permitted for an order.
 * COD is strictly restricted to ACCESSORY_ONLY orders <= 20,000,000 VND.
 * @param {object} params
 * @param {string} params.orderType
 * @param {number} params.totalVnd
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function validateCodEligibility({ orderType, totalVnd }) {
  if (orderType !== ORDER_TYPES.ACCESSORY_ONLY) {
    return {
      eligible: false,
      reason: 'COD is only available for accessory-only orders, never for motorcycles.',
    };
  }
  const safeTotal = toSafeVndNumber(totalVnd, 'totalVnd');
  if (safeTotal > COD_MAX_AMOUNT_VND) {
    return {
      eligible: false,
      reason: `COD orders cannot exceed ${formatVnd(COD_MAX_AMOUNT_VND)}.`,
    };
  }
  return { eligible: true };
}

/**
 * Calculate order subtotals, payableNowVnd (deposit vs full), and remainingBalanceVnd.
 * @param {object} params
 * @param {Array<object>} params.items
 * @param {string} params.orderType
 * @param {number} [params.shippingFeeVnd]
 * @param {number} [params.discountVnd]
 * @returns {object}
 */
export function calculateOrderTotals({ items, orderType, shippingFeeVnd = 0, discountVnd = 0 }) {
  let subtotalVnd = 0;
  let installLaborTotalVnd = 0;
  let bikeDepositTotalVnd = 0;
  let accessoryTotalWithLaborVnd = 0;

  for (const item of items) {
    const unitPrice = toSafeVndNumber(item.unitPriceVnd, 'unitPriceVnd');
    const labor = toSafeVndNumber(item.installLaborVnd ?? 0, 'installLaborVnd');
    const qty = item.quantity;

    subtotalVnd += unitPrice * qty;
    installLaborTotalVnd += labor * qty;

    if (item.itemType === 'BIKE') {
      const depositUnit = toSafeVndNumber(item.depositAmountVnd ?? 0, 'depositAmountVnd');
      bikeDepositTotalVnd += depositUnit * qty;
    } else {
      accessoryTotalWithLaborVnd += (unitPrice + labor) * qty;
    }
  }

  const safeShipping = toSafeVndNumber(shippingFeeVnd, 'shippingFeeVnd');
  const safeDiscount = toSafeVndNumber(discountVnd, 'discountVnd');
  const totalVnd = Math.max(0, subtotalVnd + installLaborTotalVnd + safeShipping - safeDiscount);

  const payableNowVnd =
    orderType === ORDER_TYPES.BIKE_DEPOSIT
      ? Math.min(totalVnd, bikeDepositTotalVnd + accessoryTotalWithLaborVnd + safeShipping)
      : totalVnd;

  const remainingBalanceVnd = Math.max(0, totalVnd - payableNowVnd);

  return {
    subtotalVnd,
    installLaborTotalVnd,
    shippingFeeVnd: safeShipping,
    discountVnd: safeDiscount,
    totalVnd,
    payableNowVnd,
    remainingBalanceVnd,
  };
}
