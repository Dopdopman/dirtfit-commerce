import {
  ALLOWED_ORDER_TRANSITIONS,
  AppError,
  COD_MAX_AMOUNT_VND,
  ERROR_CODES,
  ORDER_STATUSES,
} from '@dirtfit/shared';
import { describe, expect, it } from 'vitest';
import { assertValidOrderTransition } from '../../src/modules/orders/order-state-machine.js';

describe('Phase 12 Unit Tests — Order State Machine & COD Domain Rules', () => {
  it('permits valid order status transitions and rejects illegal state jumps with 422', () => {
    expect(() =>
      assertValidOrderTransition(ORDER_STATUSES.PENDING_PAYMENT, ORDER_STATUSES.DEPOSIT_PAID)
    ).not.toThrow();
    expect(() =>
      assertValidOrderTransition(ORDER_STATUSES.DEPOSIT_PAID, ORDER_STATUSES.READY_FOR_HANDOVER)
    ).not.toThrow();
    expect(() =>
      assertValidOrderTransition(ORDER_STATUSES.PAID, ORDER_STATUSES.COMPLETED)
    ).not.toThrow();

    try {
      assertValidOrderTransition(ORDER_STATUSES.CANCELLED, ORDER_STATUSES.PAID);
      expect.fail('Expected invalid transition CANCELLED -> PAID to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(422);
      expect(err.code).toBe(ERROR_CODES.INVALID_ORDER_TRANSITION);
    }

    expect(() =>
      assertValidOrderTransition(ORDER_STATUSES.COMPLETED, ORDER_STATUSES.PENDING_PAYMENT)
    ).toThrow(AppError);
    expect(ALLOWED_ORDER_TRANSITIONS[ORDER_STATUSES.EXPIRED]).toEqual([]);
  });

  it('enforces COD maximum eligible amount constant at 20,000,000 VND', () => {
    expect(COD_MAX_AMOUNT_VND).toBe(20_000_000);
  });
});
