import { ALLOWED_ORDER_TRANSITIONS, AppError, ERROR_CODES } from '@dirtfit/shared';

export { ALLOWED_ORDER_TRANSITIONS };

/**
 * Validate whether an Order status transition is permitted by the state machine.
 * @param {string} currentStatus
 * @param {string} nextStatus
 */
export function assertValidOrderTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_ORDER_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError({
      code: ERROR_CODES.INVALID_ORDER_TRANSITION,
      status: 422,
      title: 'Invalid order state transition',
      detail: `Cannot transition order from ${currentStatus} to ${nextStatus}.`,
    });
  }
}
