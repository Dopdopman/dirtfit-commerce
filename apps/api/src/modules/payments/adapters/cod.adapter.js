/**
 * Create Cash-On-Delivery adapter for eligible accessory-only orders <= 20,000,000 VND.
 * @returns {object}
 */
export function createCodAdapter() {
  return {
    provider: 'COD',

    /**
     * COD requires no external gateway redirect; returns immediate tracking reference.
     * @param {object} params
     * @param {object} params.order
     * @returns {Promise<object>}
     */
    async createPaymentIntent({ order }) {
      return {
        provider: 'COD',
        providerTxId: `cod_${order.orderNumber}`,
        checkoutUrl: null,
        qrCodeData: null,
      };
    },

    verifyAndParseWebhook() {
      return { isValid: false, outcome: 'FAILED' };
    },
  };
}
