import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSetCookies, startTestServer } from './helpers/http-client.js';

describe('Phase 3/12 Auth Rotation, Reuse Detection, RBAC, Helmet/CORS, RFC 7807 & Redis Rate Limiting (Supertest)', () => {
  let server;
  let app;
  let request;

  const runId = crypto.randomUUID().slice(0, 8);
  const testEmail = `auth-e2e-${runId}@dirtfit.vn`;
  const testEmail2 = `auth-e2e-2-${runId}@dirtfit.vn`;
  const testPassword = 'StrongRiderPass!2026';

  beforeAll(async () => {
    server = await startTestServer({
      envOverrides: {
        NODE_ENV: 'test',
        SWAGGER_ENABLED: true,
        RATE_LIMIT_GLOBAL_MAX: 500,
        RATE_LIMIT_AUTH_MAX: 50,
      },
      rateLimitNamespace: `df:rl:auth-e2e:${runId}:`,
    });
    app = server.app;
    request = server.request;
  });

  afterAll(async () => {
    if (!server) {
      return;
    }

    try {
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
    } finally {
      await server.close();
    }
  });

  it('serves /health/live, /health/ready, Helmet/CORS HTTP headers, and OpenAPI 3.0 /docs/json cleanly', async () => {
    const liveRes = await request.get('/health/live');
    expect(liveRes.status).toBe(200);
    expect(liveRes.body.status).toBe('live');
    expect(liveRes.headers['x-request-id']).toBeTruthy();
    expect(liveRes.headers['x-content-type-options']).toBe('nosniff');
    expect(liveRes.headers['x-frame-options']).toBeDefined();

    // CORS preflight & disallowed origin check over real HTTP
    const corsOk = await request
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(corsOk.status).toBe(204);
    expect(corsOk.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(corsOk.headers['access-control-allow-credentials']).toBe('true');

    const corsBlocked = await request
      .get('/api/v1/bikes')
      .set('Origin', 'https://evil-attacker.example');
    expect(corsBlocked.status).toBe(403);
    expect(corsBlocked.body.code).toBe('FORBIDDEN');

    const readyRes = await request.get('/health/ready');
    expect(readyRes.status).toBe(200);
    expect(readyRes.body).toMatchObject({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok' },
    });

    const docsRes = await request.get('/docs/json');
    expect(docsRes.status).toBe(200);
    const spec = docsRes.body;
    expect(spec.openapi).toMatch(/^3\.0/);
    expect(spec.paths['/api/v1/auth/login']).toBeDefined();
    expect(spec.paths['/api/v1/admin/audit-logs']).toBeDefined();
  });

  it('returns 503 on /health/ready when Redis or PostgreSQL fails', async () => {
    const degradedServer = await startTestServer({
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
      const res = await degradedServer.request.get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        status: 'degraded',
        checks: { postgres: 'ok', redis: 'error' },
      });
    } finally {
      await degradedServer.close();
    }
  });

  it('rejects unknown fields via Zod .strict() and returns RFC 7807 application/problem+json', async () => {
    const res = await request.post('/api/v1/auth/register').send({
      email: `strict-${runId}@dirtfit.vn`,
      password: testPassword,
      fullName: 'Mass Assign Tester',
      role: 'ADMIN',
    });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      type: 'https://api.dirtfit.vn/errors/VALIDATION_ERROR',
      status: 400,
      code: 'VALIDATION_ERROR',
      instance: '/api/v1/auth/register',
    });
    expect(typeof res.body.requestId).toBe('string');
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it('completes Register -> Login -> /auth/me with HttpOnly cookie and zero passwordHash leakage', async () => {
    const regRes = await request.post('/api/v1/auth/register').send({
      email: testEmail,
      password: testPassword,
      fullName: 'Nguyen E2E Rider',
      phone: '+84909123456',
    });

    expect(regRes.status).toBe(201);
    const regCookie = parseSetCookies(regRes.headers['set-cookie']).df_refresh_token;
    expect(regCookie).toBeTruthy();
    expect(regCookie.raw).toContain('HttpOnly');
    expect(regCookie.raw).toContain('Path=/api/v1/auth');
    expect(regRes.body.data.user.passwordHash).toBeUndefined();
    expect(regRes.body.data.user.role).toBe('CUSTOMER');

    // Wrong password and unknown email must return uniform 401 message
    const wrongPwRes = await request
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'WrongPassword999' });
    const missingEmailRes = await request
      .post('/api/v1/auth/login')
      .send({ email: `nonexistent-${runId}@dirtfit.vn`, password: testPassword });
    expect(wrongPwRes.status).toBe(401);
    expect(missingEmailRes.status).toBe(401);
    expect(wrongPwRes.body.detail).toBe(missingEmailRes.body.detail);

    // Valid login
    const loginRes = await request
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(loginRes.status).toBe(200);
    const loginData = loginRes.body.data;
    expect(loginData.accessToken).toBeTruthy();
    expect(loginData.user.passwordHash).toBeUndefined();

    const meRes = await request
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${loginData.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(testEmail);
    expect(meRes.body.data.user.passwordHash).toBeUndefined();
  });

  it('rotates Refresh Token and revokes entire family + writes AuditLog on Reuse Attack', async () => {
    const loginRes = await request
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    expect(loginRes.status).toBe(200);
    const rt1 = parseSetCookies(loginRes.headers['set-cookie']).df_refresh_token;
    expect(rt1).toBeTruthy();

    // CSRF Origin guard rejects evil origin on cookie endpoint
    const evilOriginRes = await request
      .post('/api/v1/auth/refresh')
      .set('origin', 'https://evil-attacker.example')
      .set('cookie', `df_refresh_token=${rt1.value}`);
    expect(evilOriginRes.status).toBe(403);

    // Legitimate rotation #1 -> issues RT2, revokes RT1
    const refresh1Res = await request
      .post('/api/v1/auth/refresh')
      .set('origin', 'http://localhost:3000')
      .set('cookie', `df_refresh_token=${rt1.value}`);
    expect(refresh1Res.status).toBe(200);
    const rt2 = parseSetCookies(refresh1Res.headers['set-cookie']).df_refresh_token;
    expect(rt2).toBeTruthy();
    expect(rt2.value).not.toBe(rt1.value);
    expect(refresh1Res.body.data.accessToken).toBeTruthy();

    // REUSE ATTACK: Attacker replays old RT1 -> must fail 401 AND revoke RT2's entire family!
    const reuseRes = await request
      .post('/api/v1/auth/refresh')
      .set('origin', 'http://localhost:3000')
      .set('cookie', `df_refresh_token=${rt1.value}`);
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.code).toBe('REFRESH_TOKEN_REUSED');

    // Verify RT2 (the newly rotated valid token in same family) is ALSO immediately invalidated!
    const victimRetryRes = await request
      .post('/api/v1/auth/refresh')
      .set('origin', 'http://localhost:3000')
      .set('cookie', `df_refresh_token=${rt2.value}`);
    expect(victimRetryRes.status).toBe(401);

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
    const unauthRes = await request.get('/api/v1/admin/users');
    expect(unauthRes.status).toBe(401);

    const customerLogin = await request
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: testPassword });
    const customerToken = customerLogin.body.data.accessToken;
    const customerCookie = parseSetCookies(customerLogin.headers['set-cookie']).df_refresh_token;

    const forbiddenRes = await request
      .get('/api/v1/admin/users')
      .set('authorization', `Bearer ${customerToken}`);
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.code).toBe('FORBIDDEN');

    const createProfileRes = await request
      .post('/api/v1/users/me/body-profiles')
      .set('authorization', `Bearer ${customerToken}`)
      .send({
        label: 'Track Profile',
        heightCm: 170,
        weightKg: 66,
        footwear: 'MX_BOOTS',
      });
    expect(createProfileRes.status).toBe(201);
    const profileId = createProfileRes.body.data.profile.id;
    expect(createProfileRes.body.data.profile.inseamCm).toBeGreaterThan(70);

    const reg2 = await request.post('/api/v1/auth/register').send({
      email: testEmail2,
      password: testPassword,
      fullName: 'Other Customer',
    });
    const token2 = reg2.body.data.accessToken;
    const idorDeleteRes = await request
      .delete(`/api/v1/users/me/body-profiles/${profileId}`)
      .set('authorization', `Bearer ${token2}`);
    expect(idorDeleteRes.status).toBe(404);

    // Logout blacklists current access token JTI in Redis immediately
    const logoutRes = await request
      .post('/api/v1/auth/logout')
      .set('authorization', `Bearer ${customerToken}`)
      .set('origin', 'http://localhost:3000')
      .set('cookie', `df_refresh_token=${customerCookie.value}`);
    expect(logoutRes.status).toBe(204);

    const revokedAccessRes = await request
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${customerToken}`);
    expect(revokedAccessRes.status).toBe(401);

    // Seeded ADMIN login -> 200 on admin routes
    const adminLogin = await request
      .post('/api/v1/auth/login')
      .send({ email: 'admin@dirtfit.vn', password: 'Admin@DirtFit2026!' });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.data.accessToken;

    const adminUsersRes = await request
      .get('/api/v1/admin/users')
      .set('authorization', `Bearer ${adminToken}`);
    expect(adminUsersRes.status).toBe(200);
    expect(adminUsersRes.body.data.length).toBeGreaterThanOrEqual(3);

    const adminAuditRes = await request
      .get('/api/v1/admin/audit-logs?action=AUTH_REFRESH_TOKEN_REUSE_DETECTED')
      .set('authorization', `Bearer ${adminToken}`);
    expect(adminAuditRes.status).toBe(200);
    expect(adminAuditRes.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('enforces Redis-backed Rate Limiting on /api/v1/auth/login returning 429 with rate-limit headers', async () => {
    const rlNamespace = `df:rl:spam-test:${runId}:`;
    const rlServer = await startTestServer({
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
        const res = await rlServer.request
          .post('/api/v1/auth/login')
          .send({ email: `spam-${runId}@dirtfit.vn`, password: 'badpassword' });
        expect(res.status).toBe(401);
        expect(res.headers['x-ratelimit-limit']).toBe('3');
      }

      const blockedRes = await rlServer.request
        .post('/api/v1/auth/login')
        .send({ email: `spam-${runId}@dirtfit.vn`, password: 'badpassword' });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers['x-ratelimit-remaining']).toBe('0');
      expect(blockedRes.headers['retry-after']).toBeDefined();
      expect(blockedRes.headers['content-type']).toContain('application/problem+json');
      expect(blockedRes.body.code).toBe('RATE_LIMITED');
    } finally {
      const keys = await rlServer.app.redis.keys(`${rlNamespace}*`);
      if (keys.length > 0) {
        await rlServer.app.redis.del(...keys);
      }
      await rlServer.close();
    }
  });
});
