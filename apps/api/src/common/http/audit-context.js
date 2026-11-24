/**
 * Extract structured actor and HTTP request metadata for immutable AuditLog persistence.
 * @param {import('fastify').FastifyRequest} request
 * @returns {object}
 */
export function buildAuditContext(request) {
  return {
    actorId: request.authUser?.id ?? null,
    actorRole: request.authUser?.role ?? null,
    ipAddress: request.ip ?? null,
    userAgent:
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent'].slice(0, 512)
        : null,
    requestId: String(request.id),
  };
}
