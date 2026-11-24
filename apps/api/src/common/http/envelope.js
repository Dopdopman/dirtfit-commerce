/**
 * Send standardized API success envelope.
 * @param {import('fastify').FastifyReply} reply
 * @param {unknown} data
 * @param {object} [options]
 * @param {number} [options.status]
 * @param {object} [options.pagination]
 * @returns {import('fastify').FastifyReply}
 */
export function sendSuccess(reply, data, { status = 200, pagination } = {}) {
  const meta = {
    requestId: String(reply.request.id),
    timestamp: new Date().toISOString(),
  };

  if (pagination) {
    meta.pagination = pagination;
  }

  return reply.code(status).send({ data, meta });
}
