export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_PAYLOAD_MISMATCH: 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',
  COD_NOT_ELIGIBLE: 'COD_NOT_ELIGIBLE',
  INVALID_ORDER_TRANSITION: 'INVALID_ORDER_TRANSITION',
  INVALID_PAYMENT_SIGNATURE: 'INVALID_PAYMENT_SIGNATURE',
  MOCK_PAYMENT_DISABLED: 'MOCK_PAYMENT_DISABLED',
  INVALID_UPLOAD_FILE: 'INVALID_UPLOAD_FILE',
  INVALID_VND_AMOUNT: 'INVALID_VND_AMOUNT',
  VND_AMOUNT_OUT_OF_SAFE_RANGE: 'VND_AMOUNT_OUT_OF_SAFE_RANGE',
  TEST_RIDE_SLOT_TAKEN: 'TEST_RIDE_SLOT_TAKEN',
  RATE_LIMITED: 'RATE_LIMITED',
  OAUTH_DISABLED: 'OAUTH_DISABLED',
  OAUTH_STATE_INVALID: 'OAUTH_STATE_INVALID',
  OAUTH_ACCESS_DENIED: 'OAUTH_ACCESS_DENIED',
  OAUTH_ID_TOKEN_INVALID: 'OAUTH_ID_TOKEN_INVALID',
  OAUTH_EMAIL_UNVERIFIED: 'OAUTH_EMAIL_UNVERIFIED',
  OAUTH_TICKET_INVALID: 'OAUTH_TICKET_INVALID',
  AUTH_OAUTH_ONLY_ACCOUNT: 'AUTH_OAUTH_ONLY_ACCOUNT',
  PASSWORD_ALREADY_SET: 'PASSWORD_ALREADY_SET',
  AUTH_LAST_LOGIN_METHOD: 'AUTH_LAST_LOGIN_METHOD',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

export class AppError extends Error {
  /**
   * Create a structured domain/HTTP application error.
   * @param {object} options
   * @param {string} options.code
   * @param {number} [options.status]
   * @param {string} [options.title]
   * @param {string} options.detail
   * @param {Array<object>} [options.errors]
   */
  constructor({ code, status = 400, title, detail, errors }) {
    super(detail || title || code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.title = title || code;
    this.detail = detail || title || code;
    this.errors = errors;
  }
}

/**
 * Build an RFC 7807 Problem Details JSON payload.
 * @param {object} params
 * @param {number} params.status
 * @param {string} params.code
 * @param {string} params.title
 * @param {string} params.detail
 * @param {string} [params.instance]
 * @param {string} [params.requestId]
 * @param {Array<object>} [params.errors]
 * @returns {object}
 */
export function buildProblemDetails({ status, code, title, detail, instance, requestId, errors }) {
  const payload = {
    type: `https://api.dirtfit.vn/errors/${code}`,
    title,
    status,
    code,
    detail,
  };

  if (instance) {
    payload.instance = instance;
  }
  if (requestId) {
    payload.requestId = requestId;
  }
  if (Array.isArray(errors) && errors.length > 0) {
    payload.errors = errors;
  }

  return payload;
}
