import { ErgonomicsCompareRequestSchema, ErgonomicsSimulateRequestSchema } from '@dirtfit/shared';
import { sendSuccess } from '../../common/http/envelope.js';
import { compareErgonomics, simulateErgonomics } from './simulator.service.js';

/**
 * Ergonomics simulation & Ghost Overlay comparison routes.
 * Exposes /ergonomics/* primary endpoints and /simulator/* architectural aliases.
 * @param {import('fastify').FastifyInstance} app
 */
export default async function simulatorRoutes(app) {
  const simulateHandler = async (request, reply) => {
    const result = await simulateErgonomics(app, request.body);
    return sendSuccess(reply, result);
  };

  const compareHandler = async (request, reply) => {
    const result = await compareErgonomics(app, request.body);
    return sendSuccess(reply, result);
  };

  app.post(
    '/ergonomics/simulate',
    {
      schema: {
        tags: ['Ergonomics Simulator'],
        summary: 'Evaluate 2D rider ergonomics, sag, foot contact, and live DB smart upsells',
        body: ErgonomicsSimulateRequestSchema,
      },
    },
    simulateHandler
  );

  app.post(
    '/ergonomics/compare',
    {
      schema: {
        tags: ['Ergonomics Simulator'],
        summary: 'Compare two motorcycles for the same rider with Ghost Overlay offsets',
        body: ErgonomicsCompareRequestSchema,
      },
    },
    compareHandler
  );

  app.post(
    '/simulator/evaluate',
    {
      schema: {
        tags: ['Ergonomics Simulator'],
        summary: 'Alias for /ergonomics/simulate',
        body: ErgonomicsSimulateRequestSchema,
      },
    },
    simulateHandler
  );

  app.post(
    '/simulator/compare',
    {
      schema: {
        tags: ['Ergonomics Simulator'],
        summary: 'Alias for /ergonomics/compare',
        body: ErgonomicsCompareRequestSchema,
      },
    },
    compareHandler
  );
}
