import { AppError, ERROR_CODES } from '@dirtfit/shared';
import { buildAuditContext } from '../../common/http/audit-context.js';
import { sendSuccess } from '../../common/http/envelope.js';
import { sweepExpiredReservations, verifyCronSecret } from './sweeper.service.js';

/**
 * Internal Cron Sweeper routes secured by X-Cron-Secret using crypto.timingSafeEqual.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function sweeperRoutes(app) {
  const sweeperHandler = async (request, reply) => {
    const provided = request.headers['x-cron-secret'];
    if (!verifyCronSecret(provided, app.env.CRON_HMAC_SECRET)) {
      throw new AppError({
        code: ERROR_CODES.UNAUTHORIZED,
        status: 401,
        title: 'Invalid cron secret',
        detail: 'Missing or invalid X-Cron-Secret header.',
      });
    }

    const result = await sweepExpiredReservations(app, buildAuditContext(request));
    return sendSuccess(reply, result);
  };

  app.post(
    '/internal/sweeper/expire-reservations',
    {
      schema: {
        tags: ['Internal Sweeper'],
        summary: 'Sweep expired inventory reservations and mark stale orders EXPIRED',
      },
    },
    sweeperHandler
  );

  app.post(
    '/internal/cron/expire-reservations',
    {
      schema: {
        tags: ['Internal Sweeper'],
        summary: 'Alias for /internal/sweeper/expire-reservations',
      },
    },
    sweeperHandler
  );
}
