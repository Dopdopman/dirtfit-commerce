import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashPassword } from '../../src/modules/auth/auth.crypto.js';

/**
 * Extract cookie name=value pairs from Set-Cookie header array or string.
 * @param {string|string[]|undefined} setCookieHeader
 * @returns {Record<string, { value: string, raw: string }>}
 */
function parseSetCookies(setCookieHeader) {
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

/**
 * Helper to execute the full Mock Google OAuth redirect chain up to /auth/google/callback.
 * @param {import('fastify').FastifyInstance} app
 * @param {object} [params]
 * @returns {Promise<{ callbackRes: object, txCookieValue: string, locationUrl: URL }>}
 */
async function runMockOAuthRedirectToCallback(app, params = {}) {
  const startUrl = new URL('http://localhost:4000/api/v1/auth/google');
  if (params.next) startUrl.searchParams.set('next', params.next);
  if (params.persona) startUrl.searchParams.set('persona', params.persona);
  if (params.email) startUrl.searchParams.set('email', params.email);
  if (params.name) startUrl.searchParams.set('name', params.name);
  if (params.sub) startUrl.searchParams.set('sub', params.sub);

  const startRes = await app.inject({
    method: 'GET',
    url: `${startUrl.pathname}${startUrl.search}`,
  });
  expect(startRes.statusCode).toBe(302);

  const startCookies = parseSetCookies(startRes.headers['set-cookie']);
  const txCookie = startCookies.df_oauth_tx;
  expect(txCookie?.value).toBeTruthy();
  expect(txCookie.raw).toContain('HttpOnly');
  expect(txCookie.raw).toContain('SameSite=Lax');

  const mockAuthLocation = new URL(startRes.headers.location);
  expect(mockAuthLocation.pathname).toBe('/api/v1/auth/google/mock-authorize');

  const mockAuthRes = await app.inject({
    method: 'GET',
    url: `${mockAuthLocation.pathname}${mockAuthLocation.search}`,
  });
  expect(mockAuthRes.statusCode).toBe(302);

  const callbackLocation = new URL(mockAuthRes.headers.location);
  expect(callbackLocation.pathname).toBe('/api/v1/auth/google/callback');

  const callbackRes = await app.inject({
    method: 'GET',
    url: `${callbackLocation.pathname}${callbackLocation.search}`,
    headers: {
      cookie: `df_oauth_tx=${txCookie.value}`,
      ...(params.accept ? { accept: params.accept } : {}),
    },
  });

  return {
    callbackRes,
    txCookieValue: txCookie.value,
    locationUrl: callbackRes.headers.location ? new URL(callbackRes.headers.location) : null,
  };
}

describe('Phase 10 Google OAuth 2.0, PKCE, One-Time Ticket & Account Linking', () => {
  let app;
  const runId = crypto.randomUUID().slice(0, 8);
  const createdEmails = [];

  beforeAll(async () => {
    app = await buildApp({
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
  });

  afterAll(async () => {
    if (!app) {
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
      await app.close();
    }
  });

  it('rejects missing/tampered df_oauth_tx state, access_denied, and unverified Google emails', async () => {
    // 1. Missing df_oauth_tx cookie -> 400 OAUTH_STATE_INVALID
    const missingCookieRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/callback?code=abc&state=xyz',
    });
    expect(missingCookieRes.statusCode).toBe(400);
    expect(missingCookieRes.json().code).toBe('OAUTH_STATE_INVALID');

    // 2. State mismatch -> 400 OAUTH_STATE_INVALID
    const startRes = await app.inject({ method: 'GET', url: '/api/v1/auth/google' });
    const txCookie = parseSetCookies(startRes.headers['set-cookie']).df_oauth_tx;
    const mismatchRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/callback?code=abc&state=wrong-state',
      headers: { cookie: `df_oauth_tx=${txCookie.value}` },
    });
    expect(mismatchRes.statusCode).toBe(400);
    expect(mismatchRes.json().code).toBe('OAUTH_STATE_INVALID');

    // 3. Browser Accept: text/html on access_denied redirects to /login?oauthError=OAUTH_ACCESS_DENIED
    const denied = await runMockOAuthRedirectToCallback(app, {
      persona: 'access_denied',
      accept: 'text/html',
    });
    expect(denied.callbackRes.statusCode).toBe(302);
    expect(denied.locationUrl.pathname).toBe('/login');
    expect(denied.locationUrl.searchParams.get('oauthError')).toBe('OAUTH_ACCESS_DENIED');

    // 4. email_verified === false strictly rejected (403 OAUTH_EMAIL_UNVERIFIED)
    const unverified = await runMockOAuthRedirectToCallback(app, {
      persona: 'unverified_email',
      sub: `mock-unverified-${runId}`,
      email: `unverified-${runId}@dirtfit.vn`,
    });
    expect(unverified.callbackRes.statusCode).toBe(403);
    expect(unverified.callbackRes.json().code).toBe('OAUTH_EMAIL_UNVERIFIED');
  });

  it('registers Case A new Google user, enforces single-use One-Time Ticket, and blocks Open Redirect', async () => {
    const email = `oauth-case-a-${runId}@dirtfit.vn`;
    createdEmails.push(email);

    // Try malicious Open Redirect next=https://evil.com -> must sanitize to /account
    const { callbackRes, locationUrl } = await runMockOAuthRedirectToCallback(app, {
      persona: 'new_rider',
      sub: `sub-case-a-${runId}`,
      email,
      name: 'Phase10 Google Rider',
      next: 'https://evil.com/phish',
    });

    expect(callbackRes.statusCode).toBe(302);
    expect(locationUrl.origin).toBe('http://localhost:3000');
    expect(locationUrl.pathname).toBe('/auth/callback');
    expect(locationUrl.searchParams.get('next')).toBe('/account');
    // Tokens MUST NEVER appear in URL query string
    expect(locationUrl.searchParams.get('accessToken')).toBeNull();
    expect(locationUrl.searchParams.get('refreshToken')).toBeNull();

    const ticket = locationUrl.searchParams.get('ticket');
    expect(ticket).toBeTruthy();

    // First exchange succeeds
    const exchange1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/exchange',
      headers: { origin: 'http://localhost:3000' },
      payload: { ticket },
    });
    expect(exchange1.statusCode).toBe(200);
    const body1 = exchange1.json().data;
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

    // Second exchange with SAME ticket MUST fail atomically (401 OAUTH_TICKET_INVALID)
    const exchange2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/exchange',
      headers: { origin: 'http://localhost:3000' },
      payload: { ticket },
    });
    expect(exchange2.statusCode).toBe(401);
    expect(exchange2.json().code).toBe('OAUTH_TICKET_INVALID');
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

    // Add 1 accessory to an anonymous guest cart before OAuth sign-in
    const seededAccessory = await app.prisma.accessory.findFirst({
      where: { deletedAt: null, status: 'ACTIVE', stockQty: { gte: 1 } },
    });
    expect(seededAccessory).toBeTruthy();

    const guestCartRes = await app.inject({
      method: 'POST',
      url: '/api/v1/cart/items',
      payload: {
        itemType: 'ACCESSORY',
        accessoryId: seededAccessory.id,
        quantity: 1,
      },
    });
    expect(guestCartRes.statusCode).toBe(201);
    const guestCookie = parseSetCookies(guestCartRes.headers['set-cookie']).df_guest_cart;
    expect(guestCookie?.value).toBeTruthy();

    const { callbackRes, locationUrl } = await runMockOAuthRedirectToCallback(app, {
      persona: 'existing_local',
      sub: `sub-admin-${runId}`,
      email: adminEmail,
      next: '/admin/bikes',
    });
    expect(callbackRes.statusCode).toBe(302);
    expect(locationUrl.searchParams.get('next')).toBe('/admin/bikes');

    const ticket = locationUrl.searchParams.get('ticket');
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/exchange',
      headers: {
        origin: 'http://localhost:3000',
        cookie: `df_guest_cart=${guestCookie.value}`,
      },
      payload: { ticket },
    });
    expect(exchangeRes.statusCode).toBe(200);
    const exchangeData = exchangeRes.json().data;
    expect(exchangeData.user.id).toBe(createdAdmin.id);
    // Role ADMIN must NEVER be overwritten to CUSTOMER
    expect(exchangeData.user.role).toBe('ADMIN');
    expect(exchangeData.user.isEmailVerified).toBe(true);
    expect(exchangeData.user.hasPassword).toBe(true);
    expect(exchangeData.user.linkedProviders).toEqual(['GOOGLE']);

    // Verify Guest Cart merged cleanly into Admin user's Cart
    const cartRes = await app.inject({
      method: 'GET',
      url: '/api/v1/cart',
      headers: { authorization: `Bearer ${exchangeData.accessToken}` },
    });
    expect(cartRes.statusCode).toBe(200);
    expect(cartRes.json().data.cart.items.some((i) => i.accessoryId === seededAccessory.id)).toBe(
      true
    );

    // Verify AuditLog recorded AUTH_OAUTH_LINKED
    const linkLog = await app.prisma.auditLog.findFirst({
      where: { actorId: createdAdmin.id, action: 'AUTH_OAUTH_LINKED' },
    });
    expect(linkLog).not.toBeNull();
  });

  it('handles Case C OAuth-only password login safely and supports Case D POST /api/v1/auth/set-password', async () => {
    const email = `oauth-case-cd-${runId}@dirtfit.vn`;
    createdEmails.push(email);

    const { locationUrl } = await runMockOAuthRedirectToCallback(app, {
      persona: 'new_rider',
      sub: `sub-case-cd-${runId}`,
      email,
    });
    const ticket = locationUrl.searchParams.get('ticket');

    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/oauth/exchange',
      headers: { origin: 'http://localhost:3000' },
      payload: { ticket },
    });
    const accessToken = exchangeRes.json().data.accessToken;

    // Case C: Password login when passwordHash is null must not crash and returns 401 AUTH_OAUTH_ONLY_ACCOUNT
    const pwdAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'RandomPassword!123' },
    });
    expect(pwdAttempt.statusCode).toBe(401);
    expect(pwdAttempt.json().code).toBe('AUTH_OAUTH_ONLY_ACCOUNT');

    // Case D: Set local password via authenticated endpoint
    const setPwdRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/set-password',
      headers: {
        authorization: `Bearer ${accessToken}`,
        origin: 'http://localhost:3000',
      },
      payload: { newPassword: 'LocalBackupPass!2026' },
    });
    expect(setPwdRes.statusCode).toBe(200);
    expect(setPwdRes.json().data.user.hasPassword).toBe(true);
    expect(setPwdRes.json().data.user.linkedProviders).toEqual(['GOOGLE']);

    // Duplicate set-password blocked with 409
    const dupSetPwd = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/set-password',
      headers: {
        authorization: `Bearer ${accessToken}`,
        origin: 'http://localhost:3000',
      },
      payload: { newPassword: 'AnotherPassword!2026' },
    });
    expect(dupSetPwd.statusCode).toBe(409);
    expect(dupSetPwd.json().code).toBe('PASSWORD_ALREADY_SET');

    // Local login now succeeds and /auth/me reflects both methods without leaking passwordHash
    const localLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'LocalBackupPass!2026' },
    });
    expect(localLogin.statusCode).toBe(200);

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${localLogin.json().data.accessToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.user.hasPassword).toBe(true);
    expect(meRes.json().data.user.linkedProviders).toEqual(['GOOGLE']);
    expect(meRes.json().data.user.passwordHash).toBeUndefined();
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

    const noMockApp = await buildApp({
      envOverrides: {
        NODE_ENV: 'test',
        GOOGLE_OAUTH_ENABLED: false,
        ENABLE_MOCK_OAUTH: false,
      },
      rateLimitNamespace: `df:rl:phase10-nomock:${runId}:`,
    });

    try {
      const mockRes = await noMockApp.inject({
        method: 'GET',
        url: '/api/v1/auth/google/mock-authorize?state=abc&nonce=def&code_challenge=ghi',
      });
      expect(mockRes.statusCode).toBe(404);

      const providersRes = await noMockApp.inject({
        method: 'GET',
        url: '/api/v1/auth/providers',
      });
      expect(providersRes.statusCode).toBe(200);
      expect(providersRes.json().data).toEqual({
        googleEnabled: false,
        mockOAuthEnabled: false,
      });
    } finally {
      await noMockApp.close();
    }
  });
});
