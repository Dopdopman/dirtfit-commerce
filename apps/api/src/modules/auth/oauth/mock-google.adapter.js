import crypto from 'node:crypto';
import { AppError, ERROR_CODES } from '@dirtfit/shared';
import { constantTimeEqual, verifyPkceChallenge } from './oauth.crypto.js';

const MOCK_PERSONAS = Object.freeze({
  new_rider: {
    sub: 'mock-google-sub-new-rider-001',
    email: 'google.rider@dirtfit.vn',
    fullName: 'Google Trail Rider',
    emailVerified: true,
    avatarUrl: 'https://cdn.dirtfit.vn/avatars/mock-google-rider.png',
  },
  existing_local: {
    sub: 'mock-google-sub-rider-seed',
    email: 'rider@dirtfit.vn',
    fullName: 'Seeded Rider (Google)',
    emailVerified: true,
    avatarUrl: 'https://cdn.dirtfit.vn/avatars/mock-seeded-rider.png',
  },
  admin_link: {
    sub: 'mock-google-sub-admin-seed',
    email: 'admin@dirtfit.vn',
    fullName: 'Admin DirtFit (Google)',
    emailVerified: true,
    avatarUrl: 'https://cdn.dirtfit.vn/avatars/mock-admin.png',
  },
  unverified_email: {
    sub: 'mock-google-sub-unverified',
    email: 'unverified.google@dirtfit.vn',
    fullName: 'Unverified User',
    emailVerified: false,
    avatarUrl: null,
  },
});

/**
 * Deterministic Mock Google OAuth 2.0 Adapter for local dev, Vitest, and Playwright E2E.
 * Strictly forbidden in production (`NODE_ENV === 'production'`).
 */
export class MockGoogleOAuthAdapter {
  /**
   * @param {object} config
   * @param {string} config.apiBaseUrl
   * @param {string} config.callbackUrl
   * @param {string} config.signingSecret
   */
  constructor({ apiBaseUrl, callbackUrl, signingSecret }) {
    this.provider = 'GOOGLE';
    this.isMock = true;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.callbackUrl = callbackUrl;
    this.signingSecret = signingSecret;
  }

  /**
   * Redirect browser/test client to local non-production mock-authorize endpoint.
   * @param {object} params
   * @param {string} params.state
   * @param {string} params.nonce
   * @param {string} params.codeChallenge
   * @param {string} [params.persona]
   * @param {string} [params.email]
   * @param {string} [params.name]
   * @param {string} [params.sub]
   * @returns {string}
   */
  buildAuthorizationUrl({ state, nonce, codeChallenge, persona, email, name, sub }) {
    const url = new URL(`${this.apiBaseUrl}/api/v1/auth/google/mock-authorize`);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    if (persona) url.searchParams.set('persona', persona);
    if (email) url.searchParams.set('email', email);
    if (name) url.searchParams.set('name', name);
    if (sub) url.searchParams.set('sub', sub);
    return url.toString();
  }

  /**
   * Build signed mock authorization code or error callback redirect URL.
   * @param {object} query
   * @returns {string}
   */
  buildMockCallbackRedirectUrl(query) {
    const target = new URL(this.callbackUrl);
    const personaKey = typeof query.persona === 'string' ? query.persona : 'new_rider';

    if (personaKey === 'access_denied') {
      target.searchParams.set('error', 'access_denied');
      if (query.state) {
        target.searchParams.set('state', String(query.state));
      }
      return target.toString();
    }

    const basePersona = MOCK_PERSONAS[personaKey] || MOCK_PERSONAS.new_rider;
    const identity = {
      sub: typeof query.sub === 'string' && query.sub.trim() ? query.sub.trim() : basePersona.sub,
      email:
        typeof query.email === 'string' && query.email.trim()
          ? query.email.trim().toLowerCase()
          : basePersona.email,
      fullName:
        typeof query.name === 'string' && query.name.trim()
          ? query.name.trim().slice(0, 120)
          : basePersona.fullName,
      emailVerified: query.email_verified === 'false' ? false : basePersona.emailVerified,
      avatarUrl: basePersona.avatarUrl,
      nonce: String(query.nonce || ''),
      codeChallenge: String(query.code_challenge || ''),
      iat: Date.now(),
    };

    const payloadB64 = Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payloadB64, 'utf8')
      .digest('base64url');

    target.searchParams.set('code', `${payloadB64}.${sig}`);
    if (query.state) {
      target.searchParams.set('state', String(query.state));
    }
    return target.toString();
  }

  /**
   * Verify HMAC signature, PKCE S256 challenge, and OIDC nonce on the mock authorization code.
   * @param {object} params
   * @param {string} params.code
   * @param {string} params.codeVerifier
   * @param {string} params.expectedNonce
   * @returns {Promise<{ providerAccountId: string, email: string, emailVerified: boolean, fullName: string, avatarUrl: string|null }>}
   */
  async exchangeCodeAndVerify({ code, codeVerifier, expectedNonce }) {
    if (typeof code !== 'string' || !code.includes('.')) {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'Invalid mock authorization code',
        detail: 'Mock OAuth code format is invalid.',
      });
    }

    const [payloadB64, providedSig] = code.split('.');
    const expectedSig = crypto
      .createHmac('sha256', this.signingSecret)
      .update(payloadB64, 'utf8')
      .digest('base64url');

    if (!constantTimeEqual(providedSig, expectedSig)) {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'Invalid mock authorization signature',
        detail: 'Mock OAuth code signature verification failed.',
      });
    }

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (parsed.nonce !== expectedNonce) {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'OIDC nonce mismatch',
        detail: 'Mock OAuth nonce did not match transaction cookie.',
      });
    }

    if (!verifyPkceChallenge(codeVerifier, parsed.codeChallenge)) {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'PKCE verification failed',
        detail: 'Mock OAuth PKCE S256 challenge mismatch.',
      });
    }

    return {
      providerAccountId: String(parsed.sub),
      email: String(parsed.email).toLowerCase(),
      emailVerified: parsed.emailVerified === true,
      fullName: String(parsed.fullName),
      avatarUrl: parsed.avatarUrl ?? null,
    };
  }
}
