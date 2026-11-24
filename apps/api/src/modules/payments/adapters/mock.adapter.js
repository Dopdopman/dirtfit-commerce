import crypto from 'node:crypto';
import { AppError, ERROR_CODES } from '@dirtfit/shared';

/**
 * Compute HMAC-SHA256 hex digest over raw webhook request body for MockPaymentAdapter.
 * @param {string} rawBody
 * @param {string} secret
 * @returns {string}
 */
export function signMockWebhookBody(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Create the local/test/CI MockPaymentAdapter (blocked strictly in production).
 * @param {object} env
 * @returns {object}
 */
export function createMockPaymentAdapter(env) {
  if (env.NODE_ENV === 'production' || !env.ENABLE_MOCK_PAYMENT) {
    throw new AppError({
      code: ERROR_CODES.MOCK_PAYMENT_DISABLED,
      status: 403,
      title: 'Mock payment adapter disabled',
      detail:
        'MockPaymentAdapter cannot be used when NODE_ENV=production or ENABLE_MOCK_PAYMENT=false.',
    });
  }

  const secret = env.MOCK_PAYMENT_WEBHOOK_SECRET;
  const appBase = env.APP_URL.replace(/\/+$/, '');

  return {
    provider: 'MOCK',

    /**
     * Issue a local simulated checkout session URL.
     * @param {object} params
     * @param {object} params.order
     * @returns {Promise<object>}
     */
    async createPaymentIntent({ order }) {
      const shortHex = crypto.randomBytes(6).toString('hex');
      const providerTxId = `mock_${order.orderNumber}_${shortHex}`;
      return {
        provider: 'MOCK',
        providerTxId,
        checkoutUrl: `${appBase}/checkout/mock?orderId=${order.id}`,
        qrCodeData: null,
      };
    },

    /**
     * Verify HMAC-SHA256 `x-mock-signature` header on rawBody using crypto.timingSafeEqual.
     * @param {object} params
     * @param {object} params.payload
     * @param {string} params.rawBody
     * @param {object} params.headers
     * @returns {object}
     */
    verifyAndParseWebhook({ payload, rawBody, headers }) {
      const provided = headers['x-mock-signature'];
      const expected = signMockWebhookBody(rawBody ?? '', secret);

      let isValid = false;
      if (typeof provided === 'string' && provided.length > 0) {
        const expectedBuf = Buffer.from(expected, 'utf8');
        const providedBuf = Buffer.from(provided.trim().toLowerCase(), 'utf8');
        if (expectedBuf.length === providedBuf.length) {
          isValid = crypto.timingSafeEqual(expectedBuf, providedBuf);
        }
      }

      return {
        isValid,
        provider: 'MOCK',
        providerTxId:
          payload.providerTxId ?? `mock_wh_${payload.orderId ?? payload.orderNumber ?? 'tx'}`,
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        amountVnd: payload.amountVnd,
        outcome: payload.outcome ?? 'SUCCEEDED',
        rawPayload: payload,
      };
    },
  };
}
