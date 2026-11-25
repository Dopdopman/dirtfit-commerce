import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { hashPassword } from '../../src/modules/auth/auth.crypto.js';
import { parseSetCookies, startTestServer } from './helpers/http-client.js';

/**
 * Execute the full Mock Google OAuth redirect chain over real HTTP up to /auth/google/callback.
 * @param {import('supertest').Agent} request
 * @param {object} [params]
 * @returns {Promise<{ callbackRes: object, txCookieValue: string, locationUrl: URL }>}
 */
async function runMockOAuthRedirectToCallback(request, params = {}) {
  const startUrl = new URL('http://localhost:4000/api/v1/auth/google');
  if (params.next) startUrl.searchParams.set('next', params.next);
  if (params.persona) startUrl.searchParams.set('persona', params.persona);
  if (params.email) startUrl.searchParams.set('email', params.email);
  if (params.name) startUrl.searchParams.set('name', params.name);
  if (params.sub) startUrl.searchParams.set('sub', params.sub);

  const startRes = await request.get(`${startUrl.pathname}${startUrl.search}`);
  expect(startRes.status).toBe(302);

  const startCookies = parseSetCookies(startRes.headers['set-cookie']);
  const txCookie = startCookies.df_oauth_tx;
  expect(txCookie?.value).toBeTruthy();
  expect(txCookie.raw).toContain('HttpOnly');
  expect(txCookie.raw).toContain('SameSite=Lax');

  const mockAuthLocation = new URL(startRes.headers.location);
  expect(mockAuthLocation.pathname).toBe('/api/v1/auth/google/mock-authorize');

  const mockAuthRes = await request.get(`${mockAuthLocation.pathname}${mockAuthLocation.search}`);
  expect(mockAuthRes.status).toBe(302);

  const callbackLocation = new URL(mockAuthRes.headers.location);
  expect(callbackLocation.pathname).toBe('/api/v1/auth/google/callback');

  let callbackReq = request
    .get(`${callbackLocation.pathname}${callbackLocation.search}`)
    .set('cookie', `df_oauth_tx=${txCookie.value}`);
  if (params.accept) {
    callbackReq = callbackReq.set('accept', params.accept);
  }
  const callbackRes = await callbackReq;

  return {
    callbackRes,
    txCookieValue: txCookie.value,
    locationUrl: callbackRes.headers.location ? new URL(callbackRes.headers.location) : null,
  };
}

describe('Phase 10/12 Google OAuth 2.0, PKCE, One-Time Ticket & Account Linking (Supertest)', () => {
  let server;
  let app;
  let request;

  const runId = crypto.randomUUID().slice(0, 8);
  const createdEmails = [];

  beforeAll(async () => {
    server = await startTestServer({
      envOverrides: {
        NODE_ENV: 'test',
        API_URL: 'http://localhost:4000',
        APP_URL: 'http://localhost:3000',
        CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
        GOOGLE_OAUTH_ENABLED: true,
        ENABLE_MOCK_OAUTH: true,
        GOOGLE_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/google/callback',
        OAUTH_STATE_SECRET: `test-oauth-secret-${runId}-0123456789abcdef`,
        RATE_LIMIT_GLOBAL_MAX: 500,
        RATE_LIMIT_AUTH_MAX: 100,
      },
      rateLimitNamespace: `df:rl:phase10-oauth:${runId}:`,
    });
    app = server.app;
    request = server.request;
  });

  afterAll(async () => {
    if (!server) {
      return;
    }

    try {
      if (createdEmails.length > 0) {
        const users = await app.prisma.user.findMany({
          where: { email: { in: createdEmails } },
          select: { id: true },
        });
        const userIds = users.map((u) => u.id);
        if (userIds.length > 0) {
          await app.prisma.auditLog.deleteMany({
            where: { actorId: { in: userIds } },
          });
          await app.prisma.cart.deleteMany({
            where: { userId: { in: userIds } },
          });
          await app.prisma.oAuthAccount.deleteMany({
            where: { userId: { in: userIds } },
          });
          await app.prisma.refreshToken.deleteMany({
            where: { userId: { in: userIds } },
          });
          await app.prisma.user.deleteMany({
            where: { id: { in: userIds } },
          });
        }
      }
    } finally {
      await server.close();
    }
  });

  it('rejects missing/tampered df_oauth_tx state, access_denied, and unverified Google emails', async () => {
    const missingCookieRes = await request.get('/api/v1/auth/google/callback?code=abc&state=xyz');
    expect(missingCookieRes.status).toBe(400);
    expect(missingCookieRes.body.code).toBe('OAUTH_STATE_INVALID');

    const startRes = await request.get('/api/v1/auth/google');
    const txCookie = parseSetCookies(startRes.headers['set-cookie']).df_oauth_tx;
    const mismatchRes = await request
      .get('/api/v1/auth/google/callback?code=abc&state=wrong-state')
      .set('cookie', `df_oauth_tx=${txCookie.value}`);
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.body.code).toBe('OAUTH_STATE_INVALID');

    const denied = await runMockOAuthRedirectToCallback(request, {
      persona: 'access_denied',
      accept: 'text/html',
    });
    expect(denied.callbackRes.status).toBe(302);
    expect(denied.locationUrl.pathname).toBe('/login');
    expect(denied.locationUrl.searchParams.get('oauthError')).toBe('OAUTH_ACCESS_DENIED');

    const unverified = await runMockOAuthRedirectToCallback(request, {
      persona: 'unverified_email',
      sub: `mock-unverified-${runId}`,
      email: `unverified-${runId}@dirtfit.vn`,
    });
    expect(unverified.callbackRes.status).toBe(403);
    expect(unverified.callbackRes.body.code).toBe('OAUTH_EMAIL_UNVERIFIED');
  });

  it('registers Case A new Google user, enforces single-use One-Time Ticket, and blocks Open Redirect', async () => {
    const email = `oauth-case-a-${runId}@dirtfit.vn`;
    createdEmails.push(email);

    const { callbackRes, locationUrl } = await runMockOAuthRedirectToCallback(request, {
      persona: 'new_rider',
      sub: `sub-case-a-${runId}`,
      email,
      name: 'Phase10 Google Rider',
      next: 'https://evil.com/phish',
    });

    expect(callbackRes.status).toBe(302);
    expect(locationUrl.origin).toBe('http://localhost:3000');
    expect(locationUrl.pathname).toBe('/auth/callback');
    expect(locationUrl.searchParams.get('next')).toBe('/account');
    expect(locationUrl.searchParams.get('accessToken')).toBeNull();
    expect(locationUrl.searchParams.get('refreshToken')).toBeNull();

    const ticket = locationUrl.searchParams.get('ticket');
    expect(ticket).toBeTruthy();

    const exchange1 = await request
      .post('/api/v1/auth/oauth/exchange')
      .set('origin', 'http://localhost:3000')
      .send({ ticket });
    expect(exchange1.status).toBe(200);
    const body1 = exchange1.body.data;
    expect(body1.accessToken).toBeTruthy();
    expect(body1.returnTo).toBe('/account');
    expect(body1.user.email).toBe(email);
    expect(body1.user.role).toBe('CUSTOMER');
    expect(body1.user.hasPassword).toBe(false);
    expect(body1.user.linkedProviders).toEqual(['GOOGLE']);
    expect(body1.user.passwordHash).toBeUndefined();

    const refreshCookie = parseSetCookies(exchange1.headers['set-cookie']).df_refresh_token;
    expect(refreshCookie?.value).toBeTruthy();
    expect(refreshCookie.raw).toContain('HttpOnly');

    const exchange2 = await request
      .post('/api/v1/auth/oauth/exchange')
      .set('origin', 'http://localhost:3000')
      .send({ ticket });
    expect(exchange2.status).toBe(401);
    expect(exchange2.body.code).toBe('OAUTH_TICKET_INVALID');
  });

  it('auto-links Case B existing ADMIN user preserving role, writes AuditLog, and merges Guest Cart', async () => {
    const adminEmail = `oauth-admin-${runId}@dirtfit.vn`;
    createdEmails.push(adminEmail);

    const passwordHash = await hashPassword('AdminOAuthTest!2026');
    const createdAdmin = await app.prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Temp Admin Account',
        passwordHash,
        role: 'ADMIN',
        isEmailVerified: false,
      },
    });

    const seededAccessory = await app.prisma.accessory.findFirst({
      where: { deletedAt: null, status: 'ACTIVE', stockQty: { gte: 1 } },
    });
    expect(seededAccessory).toBeTruthy();

    const guestCartRes = await request.post('/api/v1/cart/items').send({
      itemType: 'ACCESSORY',
      accessoryId: seededAccessory.id,
      quantity: 1,
    });
    expect(guestCartRes.status).toBe(201);
    const guestCookie = parseSetCookies(guestCartRes.headers['set-cookie']).df_guest_cart;
    expect(guestCookie?.value).toBeTruthy();

    const { callbackRes, locationUrl } = await runMockOAuthRedirectToCallback(request, {
      persona: 'existing_local',
      sub: `sub-admin-${runId}`,
      email: adminEmail,
      next: '/admin/bikes',
    });
    expect(callbackRes.status).toBe(302);
    expect(locationUrl.searchParams.get('next')).toBe('/admin/bikes');

    const ticket = locationUrl.searchParams.get('ticket');
    const exchangeRes = await request
      .post('/api/v1/auth/oauth/exchange')
      .set('origin', 'http://localhost:3000')
      .set('cookie', `df_guest_cart=${guestCookie.value}`)
      .send({ ticket });
    expect(exchangeRes.status).toBe(200);
    const exchangeData = exchangeRes.body.data;
    expect(exchangeData.user.id).toBe(createdAdmin.id);
    expect(exchangeData.user.role).toBe('ADMIN');
    expect(exchangeData.user.isEmailVerified).toBe(true);
    expect(exchangeData.user.hasPassword).toBe(true);
    expect(exchangeData.user.linkedProviders).toEqual(['GOOGLE']);

    const cartRes = await request
      .get('/api/v1/cart')
      .set('authorization', `Bearer ${exchangeData.accessToken}`);
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.data.cart.items.some((i) => i.accessoryId === seededAccessory.id)).toBe(
      true
    );

    const linkLog = await app.prisma.auditLog.findFirst({
      where: { actorId: createdAdmin.id, action: 'AUTH_OAUTH_LINKED' },
    });
    expect(linkLog).not.toBeNull();
  });

  it('handles Case C OAuth-only password login safely and supports Case D POST /api/v1/auth/set-password', async () => {
    const email = `oauth-case-cd-${runId}@dirtfit.vn`;
    createdEmails.push(email);

    const { locationUrl } = await runMockOAuthRedirectToCallback(request, {
      persona: 'new_rider',
      sub: `sub-case-cd-${runId}`,
      email,
    });
    const ticket = locationUrl.searchParams.get('ticket');

    const exchangeRes = await request
      .post('/api/v1/auth/oauth/exchange')
      .set('origin', 'http://localhost:3000')
      .send({ ticket });
    const accessToken = exchangeRes.body.data.accessToken;

    const pwdAttempt = await request
      .post('/api/v1/auth/login')
      .send({ email, password: 'RandomPassword!123' });
    expect(pwdAttempt.status).toBe(401);
    expect(pwdAttempt.body.code).toBe('AUTH_OAUTH_ONLY_ACCOUNT');

    const setPwdRes = await request
      .post('/api/v1/auth/set-password')
      .set('authorization', `Bearer ${accessToken}`)
      .set('origin', 'http://localhost:3000')
      .send({ newPassword: 'LocalBackupPass!2026' });
    expect(setPwdRes.status).toBe(200);
    expect(setPwdRes.body.data.user.hasPassword).toBe(true);
    expect(setPwdRes.body.data.user.linkedProviders).toEqual(['GOOGLE']);

    const dupSetPwd = await request
      .post('/api/v1/auth/set-password')
      .set('authorization', `Bearer ${accessToken}`)
      .set('origin', 'http://localhost:3000')
      .send({ newPassword: 'AnotherPassword!2026' });
    expect(dupSetPwd.status).toBe(409);
    expect(dupSetPwd.body.code).toBe('PASSWORD_ALREADY_SET');

    const localLogin = await request
      .post('/api/v1/auth/login')
      .send({ email, password: 'LocalBackupPass!2026' });
    expect(localLogin.status).toBe(200);

    const meRes = await request
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${localLogin.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.hasPassword).toBe(true);
    expect(meRes.body.data.user.linkedProviders).toEqual(['GOOGLE']);
    expect(meRes.body.data.user.passwordHash).toBeUndefined();
  });

  it('strictly blocks ENABLE_MOCK_OAUTH in production env validation and unmounts mock-authorize (404)', async () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        ENABLE_MOCK_PAYMENT: false,
        PAYMENT_DEFAULT_PROVIDER: 'PAYOS',
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acc-1',
        R2_ACCESS_KEY_ID: 'key-1',
        R2_SECRET_ACCESS_KEY: 'sec-1',
        ENABLE_MOCK_OAUTH: true,
      })
    ).toThrow(/ENABLE_MOCK_OAUTH must be false in production/);

    const noMockServer = await startTestServer({
      envOverrides: {
        NODE_ENV: 'test',
        GOOGLE_OAUTH_ENABLED: false,
        ENABLE_MOCK_OAUTH: false,
      },
      rateLimitNamespace: `df:rl:phase10-nomock:${runId}:`,
    });

    try {
      const mockRes = await noMockServer.request.get(
        '/api/v1/auth/google/mock-authorize?state=abc&nonce=def&code_challenge=ghi'
      );
      expect(mockRes.status).toBe(404);

      const providersRes = await noMockServer.request.get('/api/v1/auth/providers');
      expect(providersRes.status).toBe(200);
      expect(providersRes.body.data).toEqual({
        googleEnabled: false,
        mockOAuthEnabled: false,
      });
    } finally {
      await noMockServer.close();
    }
  });
});
