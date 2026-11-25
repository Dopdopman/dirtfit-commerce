import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError, ERROR_CODES } from '@dirtfit/shared';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

let cachedGoogleJwks = null;

function getGoogleJwks() {
  if (!cachedGoogleJwks) {
    cachedGoogleJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
  }
  return cachedGoogleJwks;
}

/**
 * Production Google OAuth 2.0 + OIDC adapter verifying PKCE + Google RS256 JWKS ID tokens.
 */
export class GoogleOAuthAdapter {
  /**
   * @param {object} config
   * @param {string} config.clientId
   * @param {string} config.clientSecret
   * @param {string} config.callbackUrl
   * @param {typeof fetch} [config.fetchImpl]
   */
  constructor({ clientId, clientSecret, callbackUrl, fetchImpl = fetch }) {
    this.provider = 'GOOGLE';
    this.isMock = false;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.callbackUrl = callbackUrl;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Build the Google OIDC authorization URL with PKCE S256, CSRF state, and OIDC nonce.
   * @param {object} params
   * @param {string} params.state
   * @param {string} params.nonce
   * @param {string} params.codeChallenge
   * @returns {string}
   */
  buildAuthorizationUrl({ state, nonce, codeChallenge }) {
    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  /**
   * Exchange authorization code + PKCE code_verifier for Google tokens and verify ID token via JWKS.
   * @param {object} params
   * @param {string} params.code
   * @param {string} params.codeVerifier
   * @param {string} params.expectedNonce
   * @returns {Promise<{ providerAccountId: string, email: string, emailVerified: boolean, fullName: string, avatarUrl: string|null }>}
   */
  async exchangeCodeAndVerify({ code, codeVerifier, expectedNonce }) {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.callbackUrl,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    let tokenResponse;
    try {
      tokenResponse = await this.fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 502,
        title: 'Google token exchange failed',
        detail: 'Unable to reach Google OAuth token endpoint.',
      });
    }

    if (!tokenResponse.ok) {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'Google authorization code rejected',
        detail: 'Google rejected the authorization code or PKCE verifier.',
      });
    }

    const tokenJson = await tokenResponse.json();
    const idToken = tokenJson?.id_token;
    if (typeof idToken !== 'string' || idToken.length === 0) {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'Missing Google ID token',
        detail: 'Google token response did not include a valid id_token.',
      });
    }

    let payload;
    try {
      const verified = await jwtVerify(idToken, getGoogleJwks(), {
        issuer: GOOGLE_ISSUERS,
        audience: this.clientId,
      });
      payload = verified.payload;
    } catch {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'Invalid Google ID token',
        detail: 'Google ID token signature or claims failed verification.',
      });
    }

    if (payload.nonce !== expectedNonce || !payload.sub || typeof payload.email !== 'string') {
      throw new AppError({
        code: ERROR_CODES.OAUTH_ID_TOKEN_INVALID,
        status: 401,
        title: 'Invalid Google ID token claims',
        detail: 'Google ID token nonce, sub, or email claim mismatch.',
      });
    }

    const avatarUrl =
      typeof payload.picture === 'string' && payload.picture.startsWith('https://')
        ? payload.picture.slice(0, 512)
        : null;

    return {
      providerAccountId: String(payload.sub),
      email: payload.email.trim().toLowerCase(),
      emailVerified: payload.email_verified === true,
      fullName:
        typeof payload.name === 'string' && payload.name.trim().length >= 2
          ? payload.name.trim().slice(0, 120)
          : payload.email.split('@')[0],
      avatarUrl,
    };
  }
}
