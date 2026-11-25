import { AppError, ERROR_CODES } from '@dirtfit/shared';
import { GoogleOAuthAdapter } from './google.adapter.js';
import { MockGoogleOAuthAdapter } from './mock-google.adapter.js';
import { resolveOAuthStateSecret } from './oauth.crypto.js';

/**
 * Resolve the active Google OAuth adapter according to runtime environment policy.
 * Never activates MockGoogleOAuthAdapter when `NODE_ENV === 'production'`.
 * @param {object} env
 * @returns {GoogleOAuthAdapter|MockGoogleOAuthAdapter}
 */
export function resolveGoogleOAuthAdapter(env) {
  if (!env.GOOGLE_OAUTH_ENABLED) {
    throw new AppError({
      code: ERROR_CODES.OAUTH_DISABLED,
      status: 404,
      title: 'Google OAuth disabled',
      detail: 'Google OAuth sign-in is disabled on this environment.',
    });
  }

  const callbackUrl =
    env.GOOGLE_CALLBACK_URL || `${env.API_URL.replace(/\/+$/, '')}/api/v1/auth/google/callback`;

  if (env.NODE_ENV !== 'production' && env.ENABLE_MOCK_OAUTH) {
    return new MockGoogleOAuthAdapter({
      apiBaseUrl: env.API_URL,
      callbackUrl,
      signingSecret: resolveOAuthStateSecret(env),
    });
  }

  return new GoogleOAuthAdapter({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl,
  });
}
