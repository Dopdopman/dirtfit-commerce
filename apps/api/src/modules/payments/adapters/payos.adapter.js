import crypto from 'node:crypto';

/**
 * Verify two hex/UTF-8 signature strings in constant time.
 * @param {string} expectedHex
 * @param {unknown} providedHex
 * @returns {boolean}
 */
function timingSafeEqualHex(expectedHex, providedHex) {
  if (typeof providedHex !== 'string' || providedHex.length === 0) {
    return false;
  }
  const expectedBuf = Buffer.from(expectedHex.toLowerCase(), 'utf8');
  const providedBuf = Buffer.from(providedHex.trim().toLowerCase(), 'utf8');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * Canonicalize PayOS data object (alphabetically sorted keys joined with &) and sign via HMAC-SHA256.
 * @param {Record<string, unknown>} data
 * @param {string} checksumKey
 * @returns {string}
 */
export function signPayOSWebhookData(data, checksumKey) {
  const sortedKeys = Object.keys(data ?? {}).sort();
  const pairs = sortedKeys.map((key) => {
    const val = data[key];
    if (val === null || val === undefined) {
      return `${key}=`;
    }
    if (typeof val === 'object') {
      return `${key}=${JSON.stringify(val)}`;
    }
    return `${key}=${String(val)}`;
  });
  return crypto.createHmac('sha256', checksumKey).update(pairs.join('&')).digest('hex');
}

/**
 * Create the PayOS PaymentAdapter (VietQR checkout + constant-time HMAC-SHA256 webhook verification).
 * @param {object} env
 * @returns {object}
 */
export function createPayOSAdapter(env) {
  const checksumKey = env.PAYOS_CHECKSUM_KEY;

  return {
    provider: 'PAYOS',

    /**
     * Create a VietQR payment session for bike deposit or online purchase.
     * @param {object} params
     * @param {object} params.order
     * @returns {Promise<object>}
     */
    async createPaymentIntent({ order }) {
      const shortHex = crypto.randomBytes(6).toString('hex');
      const providerTxId = `payos_${order.orderNumber}_${shortHex}`;
      const checkoutUrl = `https://pay.payos.vn/web/${order.orderNumber}`;
      const qrCodeData = `VIETQR|PAYOS|${order.orderNumber}|${order.payableNowVnd}`;

      return {
        provider: 'PAYOS',
        providerTxId,
        checkoutUrl,
        qrCodeData,
      };
    },

    /**
     * Verify PayOS webhook signature via crypto.timingSafeEqual and parse transaction payload.
     * @param {object} params
     * @param {object} params.payload
     * @returns {object}
     */
    verifyAndParseWebhook({ payload }) {
      const expectedSig = signPayOSWebhookData(payload.data, checksumKey);
      const isValid = timingSafeEqualHex(expectedSig, payload.signature);
      const data = payload.data ?? {};

      const orderNumber =
        typeof data.orderCode === 'string'
          ? data.orderCode
          : typeof data.description === 'string'
            ? data.description
            : undefined;
      const orderId = typeof data.orderId === 'string' ? data.orderId : undefined;
      const amountVnd =
        data.amount !== undefined && Number.isFinite(Number(data.amount))
          ? Number(data.amount)
          : undefined;
      const providerTxId =
        typeof data.reference === 'string' && data.reference.length > 0
          ? data.reference
          : `payos_wh_${orderNumber ?? orderId ?? 'unknown'}`;

      return {
        isValid,
        provider: 'PAYOS',
        providerTxId,
        orderId,
        orderNumber,
        amountVnd,
        outcome: payload.code === '00' && payload.success !== false ? 'SUCCEEDED' : 'FAILED',
        rawPayload: payload,
      };
    },
  };
}
