import supertest from 'supertest';
import { buildApp } from '../../../src/app.js';

/**
 * Boot a real Fastify HTTP server bound to an ephemeral loopback port (`port: 0`)
 * wrapped with Supertest for Tier 2 black-box HTTP integration testing.
 * @param {object} [options]
 * @returns {Promise<{
 *   app: import('fastify').FastifyInstance,
 *   request: import('supertest').Agent,
 *   createAgent: () => import('supertest').Agent,
 *   baseUrl: string,
 *   close: () => Promise<void>,
 * }>}
 */
export async function startTestServer(options = {}) {
  const app = await buildApp(options);
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const request = supertest(app.server);

  return {
    app,
    request,
    createAgent: () => supertest.agent(app.server),
    baseUrl: typeof address === 'string' ? address : `http://127.0.0.1:${address.port}`,
    async close() {
      await app.close();
    },
  };
}

/**
 * Parse `Set-Cookie` HTTP header(s) into a `{ [name]: { value, raw } }` lookup map.
 * @param {string|string[]|undefined} setCookieHeader
 * @returns {Record<string, { value: string, raw: string }>}
 */
export function parseSetCookies(setCookieHeader) {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const map = {};
  for (const raw of list) {
    const firstPart = raw.split(';')[0];
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim();
      const value = firstPart.slice(eqIdx + 1);
      map[name] = { value, raw };
    }
  }
  return map;
}
