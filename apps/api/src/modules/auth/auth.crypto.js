import crypto from 'node:crypto';
import argon2 from 'argon2';

export const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
});

let cachedDummyHashPromise = null;

/**
 * Hash a plaintext password with Argon2id.
 * @param {string} plainPassword
 * @returns {Promise<string>}
 */
export async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored Argon2id hash.
 * @param {string} passwordHash
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(passwordHash, plainPassword) {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

/**
 * Perform dummy Argon2id verification to equalize login timing when email is absent.
 * @param {string} plainPassword
 * @returns {Promise<boolean>}
 */
export async function verifyDummyPassword(plainPassword) {
  if (!cachedDummyHashPromise) {
    cachedDummyHashPromise = argon2.hash(crypto.randomBytes(24).toString('hex'), ARGON2_OPTIONS);
  }
  const dummyHash = await cachedDummyHashPromise;
  await verifyPassword(dummyHash, plainPassword);
  return false;
}

/**
 * Generate a high-entropy opaque refresh token string.
 * @returns {string}
 */
export function generateRawRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Hash an opaque refresh token using HMAC-SHA256 with server pepper (64-char hex).
 * @param {string} rawToken
 * @param {string} pepper
 * @returns {string}
 */
export function hashRefreshToken(rawToken, pepper) {
  return crypto.createHmac('sha256', pepper).update(rawToken).digest('hex');
}
