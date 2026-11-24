import { AppError, ERROR_CODES, PAYMENT_METHODS } from '@dirtfit/shared';
import { createCodAdapter } from './cod.adapter.js';
import { createMockPaymentAdapter } from './mock.adapter.js';
import { createPayOSAdapter } from './payos.adapter.js';

/**
 * Resolve the configured PaymentAdapter instance for a given payment provider enum.
 * @param {string} provider
 * @param {object} env
 * @returns {object}
 */
export function getPaymentAdapter(provider, env) {
  switch (provider) {
    case PAYMENT_METHODS.PAYOS:
      return createPayOSAdapter(env);
    case PAYMENT_METHODS.MOCK:
      return createMockPaymentAdapter(env);
    case PAYMENT_METHODS.COD:
      return createCodAdapter();
    default:
      throw new AppError({
        code: ERROR_CODES.VALIDATION_ERROR,
        status: 400,
        title: 'Unsupported payment provider',
        detail: `Payment provider ${provider} is not enabled in this deployment.`,
      });
  }
}
