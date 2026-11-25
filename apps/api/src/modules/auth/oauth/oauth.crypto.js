import crypto from 'node:crypto';

export const OAUTH_TX_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Constant-time string comparison safe against mismatched lengths.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate an RFC 7636 PKCE verifier and S256 code challenge pair.
 * @returns {{ codeVerifier: string, codeChallenge: string, codeChallengeMethod: 'S256' }}
 */
export function generatePkcePair() {
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier, 'ascii')
    .digest('base64url');
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Verify a PKCE S256 code_verifier against an expected code_challenge.
 * @param {string} codeVerifier
 * @param {string} expectedChallenge
 * @returns {boolean}
 */
export function verifyPkceChallenge(codeVerifier, expectedChallenge) {
  if (typeof codeVerifier !== 'string' || typeof expectedChallenge !== 'string') {
    return false;
  }
  if (codeVerifier.length < 43 || codeVerifier.length > 128) {
    return false;
  }
  const computed = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
  return constantTimeEqual(computed, expectedChallenge);
}

/**
 * Generate a 256-bit CSRF OAuth state parameter.
 * @returns {string}
 */
export function generateOAuthState() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a 256-bit OIDC nonce parameter.
 * @returns {string}
 */
export function generateOAuthNonce() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a 256-bit opaque one-time handoff ticket for cross-origin exchange.
 * @returns {string}
 */
export function generateOneTimeTicket() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Compute HMAC-SHA256 digest of a raw one-time ticket for Redis storage.
 * @param {string} rawTicket
 * @param {string} pepper
 * @returns {string}
 */
export function hashOneTimeTicket(rawTicket, pepper) {
  return crypto.createHmac('sha256', pepper).update(rawTicket, 'utf8').digest('hex');
}

/**
 * Resolve the dedicated AES-GCM secret (or HKDF-derive from COOKIE_SECRET).
 * @param {object} env
 * @returns {string}
 */
export function resolveOAuthStateSecret(env) {
  if (typeof env.OAUTH_STATE_SECRET === 'string' && env.OAUTH_STATE_SECRET.length >= 32) {
    return env.OAUTH_STATE_SECRET;
  }
  return Buffer.from(
    crypto.hkdfSync('sha256', env.COOKIE_SECRET, 'dirtfit-oauth-tx-salt', 'oauth-tx-v2', 32)
  ).toString('hex');
}

/**
 * Derive a fixed 32-byte AES-256 key from an arbitrary string secret via HKDF-SHA256.
 * @param {string} secret
 * @returns {Buffer}
 */
function deriveAesKey(secret) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('[oauth.crypto] OAuth state encryption secret must be at least 16 characters.');
  }
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'dirtfit-aes256-gcm', 'df-oauth-tx', 32));
}

/**
 * Encrypt short-lived OAuth transaction state into an authenticated AES-256-GCM string.
 * @param {object} payload
 * @param {string} secret
 * @returns {string}
 */
export function encryptOAuthTxPayload(payload, secret) {
  const key = deriveAesKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const serialized = JSON.stringify({
    ...payload,
    iat: typeof payload.iat === 'number' ? payload.iat : Date.now(),
  });
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${authTag.toString('base64url')}`;
}

/**
 * Decrypt and verify integrity + age of the AES-256-GCM OAuth transaction cookie payload.
 * Returns null if malformed, tampered, or expired.
 * @param {string|undefined|null} token
 * @param {string} secret
 * @param {object} [options]
 * @param {number} [options.maxAgeMs]
 * @param {number} [options.nowMs]
 * @returns {object|null}
 */
export function decryptOAuthTxPayload(
  token,
  secret,
  { maxAgeMs = OAUTH_TX_MAX_AGE_MS, nowMs = Date.now() } = {}
) {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const [ivB64, ciphertextB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64url');
    const ciphertext = Buffer.from(ciphertextB64, 'base64url');
    const authTag = Buffer.from(tagB64, 'base64url');

    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      return null;
    }

    const key = deriveAesKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
      'utf8'
    );
    const parsed = JSON.parse(plaintext);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.state !== 'string' ||
      typeof parsed.codeVerifier !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.iat !== 'number'
    ) {
      return null;
    }

    if (nowMs - parsed.iat > maxAgeMs || parsed.iat > nowMs + 30_000) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Detect ASCII control characters or backslashes that could bypass URL origin checks.
 * @param {string} value
 * @returns {boolean}
 */
function hasUnsafePathChars(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127 || code === 92) {
      return true;
    }
  }
  return false;
}

/**
 * Strictly validate an OAuth post-login return path against Open Redirect vectors.
 * Only relative single-leading-slash paths on the same site are accepted.
 * @param {unknown} rawNext
 * @param {string} [fallback]
 * @returns {string}
 */
export function sanitizeReturnTo(rawNext, fallback = '/account') {
  if (typeof rawNext !== 'string') {
    return fallback;
  }
  const trimmed = rawNext.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    return fallback;
  }
  if (hasUnsafePathChars(trimmed)) {
    return fallback;
  }
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, 'https://dirtfit.local');
    if (parsed.origin !== 'https://dirtfit.local') {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
