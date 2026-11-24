import {
  MockWebhookSimulateSchema,
  PAYMENT_METHODS,
  PayOSWebhookPayloadSchema,
} from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import { handlePaymentWebhook } from './payments.service.js';

/**
 * Payment Webhook & Non-Prod Mock Simulator routes with rawBody preservation for HMAC verification.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function paymentsRoutes(app) {
  // Scoped JSON parser preserving request.rawBody for constant-time HMAC signature checks
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    request.rawBody = body;
    if (!body || body.trim().length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err);
    }
  });

  app.post(
    '/payments/webhooks/payos',
    {
      schema: {
        tags: ['Payments'],
        summary: 'PayOS signed webhook receiver with idempotent inventory commit',
        body: PayOSWebhookPayloadSchema,
      },
    },
    async (request, reply) => {
      const result = await handlePaymentWebhook(app, {
        provider: PAYMENT_METHODS.PAYOS,
        payload: request.body,
        rawBody: request.rawBody ?? JSON.stringify(request.body),
        headers: request.headers,
        auditCtx: buildAuditContext(request),
      });
      return sendSuccess(reply, result);
    }
  );

  if (app.env.NODE_ENV !== 'production' && app.env.ENABLE_MOCK_PAYMENT) {
    app.post(
      '/payments/mock/simulate-webhook',
      {
        schema: {
          tags: ['Payments'],
          summary: 'Simulate signed payment webhook locally or in CI (non-production only)',
          body: MockWebhookSimulateSchema,
        },
      },
      async (request, reply) => {
        const result = await handlePaymentWebhook(app, {
          provider: PAYMENT_METHODS.MOCK,
          payload: request.body,
          rawBody: request.rawBody ?? JSON.stringify(request.body),
          headers: request.headers,
          auditCtx: buildAuditContext(request),
        });
        return sendSuccess(reply, result);
      }
    );
  }
}
