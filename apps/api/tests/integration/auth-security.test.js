import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

/**
 * Parse Set-Cookie header(s) for df_refresh_token value and cookie attributes.
 * @param {string|string[]|undefined} setCookieHeader
 * @returns {{ value: string, raw: string } | null}
 */
function extractRefreshCookie(setCookieHeader) {
  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  for (const raw of headers) {
    if (raw.startsWith('df_refresh_token=')) {
      const firstPart = raw.split(';')[0];
      const value = firstPart.slice('df_refresh_token='.length);
      return { value, raw };
    }
  }
  return null;
}

describe('Phase 3 Auth Rotation, Reuse Detection, RBAC, RFC 7807 & Redis Rate Limiting', () => {
  let app;
  const runId = crypto.randomUUID().slice(0, 8);
  const testEmail = `auth-e2e-${runId}@dirtfit.vn`;
  const testEmail2 = `auth-e2e-2-${runId}@dirtfit.vn`;
  const testPassword = 'StrongRiderPass!2026';

  beforeAll(async () => {
    app = await buildApp({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: true,
        RATE_LIMIT_GLOBAL_MAX: 500,
        RATE_LIMIT_AUTH_MAX: 50,
      },
      rateLimitNamespace: `df:rl:auth-e2e:${runId}:`,
    });
  });

  afterAll(async () => {
    if (app) {
      const testUsers = await app.prisma.user.findMany({
        where: { email: { in: [testEmail, testEmail2] } },
        select: { id: true },
      });
      const testUserIds = testUsers.map((u) => u.id);

      if (testUserIds.length > 0) {
        await app.prisma.auditLog.deleteMany({
          where: { actorId: { in: testUserIds } },
        });
        await app.prisma.user.deleteMany({
          where: { id: { in: testUserIds } },
        });
      }

      await app.close();
    }
  });

  it('serves /health/live, /health/ready, and OpenAPI 3.0 /docs/json cleanly', async () => {
    const liveRes = await app.inject({ method: 'GET', url: '/health/live' });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().status).toBe('live');
    expect(liveRes.headers['x-request-id']).toBeTruthy();

    const readyRes = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(readyRes.statusCode).toBe(200);
    expect(readyRes.json()).toMatchObject({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    });

    const docsRes = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(docsRes.statusCode).toBe(200);
    const spec = docsRes.json();
    expect(spec.openapi).toMatch(/^3\.0/);
    expect(spec.paths['/api/v1/auth/login']).toBeDefined();
    expect(spec.paths['/api/v1/admin/audit-logs']).toBeDefined();
  });

  it('returns 503 on /health/ready when Redis or PostgreSQL fails', async () => {
    const degradedApp = await buildApp({
      envOverrides: { NODE_ENV: 'test', SWAGGER_ENABLED: false },
      prismaClient: app.prisma,
      redisClient: {
        defineCommand: () => {},
        ping: async () => {
          throw new Error('Redis down');
        },
        get: async () => null,
        set: async () => 'OK',
      },
      rateLimitNamespace: `df:rl:degraded:${runId}:`,
    });

    try {
      const res = await degradedApp.inject({ method: 'GET', url: '/health/ready' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({
        status: 'degraded',
        checks: { postgres: 'ok', redis: 'error' },
      });
    } finally {
      await degradedApp.close();
    }
  });

  it('rejects unknown fields via Zod .strict() and returns RFC 7807 application/problem+json', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `strict-${runId}@dirtfit.vn`,
        password: testPassword,
        fullName: 'Mass Assign Tester',
        role: 'ADMIN',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json();
    expect(body).toMatchObject({
      type: 'https://api.dirtfit.vn/errors/VALIDATION_ERROR',
      status: 400,
      code: 'VALIDATION_ERROR',
      instance: '/api/v1/auth/register',
    });
    expect(typeof body.requestId).toBe('string');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('completes Register -> Login -> /auth/me with HttpOnly cookie and zero passwordHash leakage', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail,
        password: testPassword,
        fullName: 'Nguyen E2E Rider',
        phone: '+84909123456',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regCookie = extractRefreshCookie(regRes.headers['set-cookie']);
    expect(regCookie).not.toBeNull();
    expect(regCookie.raw).toContain('HttpOnly');
    expect(regCookie.raw).toContain('Path=/api/v1/auth');
    expect(regRes.json().data.user.passwordHash).toBeUndefined();
    expect(regRes.json().data.user.role).toBe('CUSTOMER');

    // Wrong password and unknown email must return uniform 401 message
    const wrongPwRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: 'WrongPassword999' },
    });
    const missingEmailRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `nonexistent-${runId}@dirtfit.vn`, password: testPassword },
    });
    expect(wrongPwRes.statusCode).toBe(401);
    expect(missingEmailRes.statusCode).toBe(401);
    expect(wrongPwRes.json().detail).toBe(missingEmailRes.json().detail);

    // Valid login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginData = loginRes.json().data;
    expect(loginData.accessToken).toBeTruthy();
    expect(loginData.user.passwordHash).toBeUndefined();

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${loginData.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.user.email).toBe(testEmail);
    expect(meRes.json().data.user.passwordHash).toBeUndefined();
  });

  it('rotates Refresh Token and revokes entire family + writes AuditLog on Reuse Attack', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    });
    expect(loginRes.statusCode).toBe(200);
    const rt1 = extractRefreshCookie(loginRes.headers['set-cookie']);
    expect(rt1).not.toBeNull();

    // CSRF Origin guard rejects evil origin on cookie endpoint
    const evilOriginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        origin: 'https://evil-attacker.example',
        cookie: `df_refresh_token=${rt1.value}`,
      },
    });
    expect(evilOriginRes.statusCode).toBe(403);

    // Legitimate rotation #1 -> issues RT2, revokes RT1
    const refresh1Res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `df_refresh_token=${rt1.value}`,
      },
    });
    expect(refresh1Res.statusCode).toBe(200);
    const rt2 = extractRefreshCookie(refresh1Res.headers['set-cookie']);
    expect(rt2).not.toBeNull();
    expect(rt2.value).not.toBe(rt1.value);
    expect(refresh1Res.json().data.accessToken).toBeTruthy();

    // REUSE ATTACK: Attacker replays old RT1 -> must fail 401 AND revoke RT2's entire family!
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `df_refresh_token=${rt1.value}`,
      },
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().code).toBe('REFRESH_TOKEN_REUSED');

    // Verify RT2 (the newly rotated valid token in same family) is ALSO immediately invalidated!
    const victimRetryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `df_refresh_token=${rt2.value}`,
      },
    });
    expect(victimRetryRes.statusCode).toBe(401);

    // Verify AuditLog recorded the reuse event
    const testUser = await app.prisma.user.findUnique({ where: { email: testEmail } });
    const auditRows = await app.prisma.auditLog.findMany({
      where: {
        actorId: testUser.id,
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
      },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces RBAC (401/403/200), IDOR protection on body profiles, and JWT JTI revocation on logout', async () => {
    // 1. Unauthenticated access -> 401
    const unauthRes = await app.inject({ method: 'GET', url: '/api/v1/admin/users' });
    expect(unauthRes.statusCode).toBe(401);

    // 2. CUSTOMER login -> 403 on admin routes
    const customerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: testPassword },
    });
    const customerToken = customerLogin.json().data.accessToken;
    const customerCookie = extractRefreshCookie(customerLogin.headers['set-cookie']);

    const forbiddenRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(forbiddenRes.statusCode).toBe(403);
    expect(forbiddenRes.json().code).toBe('FORBIDDEN');

    // Create body profile as customer 1, confirm customer 2 cannot read/delete it (IDOR -> 404)
    const createProfileRes = await app.inject({
      method: 'POST',
      url: '/api/v1/users/me/body-profiles',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: {
        label: 'Track Profile',
        heightCm: 170,
        weightKg: 66,
        footwear: 'MX_BOOTS',
      },
    });
    expect(createProfileRes.statusCode).toBe(201);
    const profileId = createProfileRes.json().data.profile.id;
    expect(createProfileRes.json().data.profile.inseamCm).toBeGreaterThan(70);

    const reg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: testEmail2,
        password: testPassword,
        fullName: 'Other Customer',
      },
    });
    const token2 = reg2.json().data.accessToken;
    const idorDeleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/me/body-profiles/${profileId}`,
      headers: { authorization: `Bearer ${token2}` },
    });
    expect(idorDeleteRes.statusCode).toBe(404);

    // 3. Logout blacklists current access token JTI in Redis immediately
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        authorization: `Bearer ${customerToken}`,
        origin: 'http://localhost:3000',
        cookie: `df_refresh_token=${customerCookie.value}`,
      },
    });
    expect(logoutRes.statusCode).toBe(204);

    const revokedAccessRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(revokedAccessRes.statusCode).toBe(401);

    // 4. Seeded ADMIN login -> 200 on admin routes
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@dirtfit.vn', password: 'Admin@DirtFit2026!' },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = adminLogin.json().data.accessToken;

    const adminUsersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminUsersRes.statusCode).toBe(200);
    expect(adminUsersRes.json().data.length).toBeGreaterThanOrEqual(3);

    const adminAuditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=AUTH_REFRESH_TOKEN_REUSE_DETECTED',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminAuditRes.statusCode).toBe(200);
    expect(adminAuditRes.json().data.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces Redis-backed Rate Limiting on /api/v1/auth/login returning 429 with rate-limit headers', async () => {
    const rlNamespace = `df:rl:spam-test:${runId}:`;
    const rlApp = await buildApp({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: false,
        RATE_LIMIT_GLOBAL_MAX: 50,
        RATE_LIMIT_AUTH_MAX: 3,
      },
      prismaClient: app.prisma,
      rateLimitNamespace: rlNamespace,
    });

    try {
      for (let i = 0; i < 3; i += 1) {
        const res = await rlApp.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: `spam-${runId}@dirtfit.vn`, password: 'badpassword' },
        });
        expect(res.statusCode).toBe(401);
        expect(res.headers['x-ratelimit-limit']).toBe('3');
      }

      const blockedRes = await rlApp.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: `spam-${runId}@dirtfit.vn`, password: 'badpassword' },
      });
      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.headers['x-ratelimit-remaining']).toBe('0');
      expect(blockedRes.headers['retry-after']).toBeDefined();
      expect(blockedRes.headers['content-type']).toContain('application/problem+json');
      expect(blockedRes.json().code).toBe('RATE_LIMITED');
    } finally {
      const keys = await rlApp.redis.keys(`${rlNamespace}*`);
      if (keys.length > 0) {
        await rlApp.redis.del(...keys);
      }
      await rlApp.close();
    }
  });
});
