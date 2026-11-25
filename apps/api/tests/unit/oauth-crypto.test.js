import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptOAuthTxPayload,
  encryptOAuthTxPayload,
  generateOAuthNonce,
  generateOAuthState,
  generateOneTimeTicket,
  generatePkcePair,
  hashOneTimeTicket,
  sanitizeReturnTo,
  verifyPkceChallenge,
} from '../../src/modules/auth/oauth/oauth.crypto.js';

describe('Phase 10 OAuth 2.0 Crypto, PKCE S256 & Open Redirect Guard', () => {
  it('generates and verifies RFC 7636 PKCE S256 verifier/challenge pairs accurately', () => {
    const pkce = generatePkcePair();
    expect(pkce.codeChallengeMethod).toBe('S256');
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(pkce.codeVerifier.length).toBeLessThanOrEqual(128);

    const expectedChallenge = crypto
      .createHash('sha256')
      .update(pkce.codeVerifier, 'ascii')
      .digest('base64url');
    expect(pkce.codeChallenge).toBe(expectedChallenge);
    expect(verifyPkceChallenge(pkce.codeVerifier, pkce.codeChallenge)).toBe(true);
    expect(verifyPkceChallenge(`${pkce.codeVerifier}tamper`, pkce.codeChallenge)).toBe(false);
    expect(verifyPkceChallenge('short', pkce.codeChallenge)).toBe(false);

    const ticket = generateOneTimeTicket();
    expect(hashOneTimeTicket(ticket, 'pepper-secret-012345')).toHaveLength(64);
  });

  it('encrypts/decrypts df_oauth_tx via AES-256-GCM and rejects tampered or expired tokens', () => {
    const secret = 'test-oauth-state-secret-at-least-32-bytes-long-012345';
    const state = generateOAuthState();
    const nonce = generateOAuthNonce();
    const pkce = generatePkcePair();
    const issuedAt = 1_795_000_000_000;

    const encrypted = encryptOAuthTxPayload(
      {
        state,
        nonce,
        codeVerifier: pkce.codeVerifier,
        returnTo: '/checkout',
        iat: issuedAt,
      },
      secret
    );

    const decrypted = decryptOAuthTxPayload(encrypted, secret, {
      maxAgeMs: 300_000,
      nowMs: issuedAt + 60_000,
    });
    expect(decrypted).toMatchObject({
      state,
      nonce,
      codeVerifier: pkce.codeVerifier,
      returnTo: '/checkout',
    });

    // Tampered ciphertext rejected
    const parts = encrypted.split('.');
    const tampered = `${parts[0]}.${parts[1].slice(0, -2)}AA.${parts[2]}`;
    expect(decryptOAuthTxPayload(tampered, secret, { nowMs: issuedAt + 1000 })).toBeNull();

    // Wrong secret rejected
    expect(
      decryptOAuthTxPayload(encrypted, 'different-secret-must-also-be-at-least-32-bytes', {
        nowMs: issuedAt + 1000,
      })
    ).toBeNull();

    // Expired token rejected
    expect(
      decryptOAuthTxPayload(encrypted, secret, {
        maxAgeMs: 300_000,
        nowMs: issuedAt + 301_000,
      })
    ).toBeNull();

    // Malformed values rejected
    expect(decryptOAuthTxPayload('', secret)).toBeNull();
    expect(decryptOAuthTxPayload('not.a.valid.token', secret)).toBeNull();
  });

  it('strictly blocks Open Redirect vectors in sanitizeReturnTo()', () => {
    expect(sanitizeReturnTo('/bikes/ktm-350-exc-f')).toBe('/bikes/ktm-350-exc-f');
    expect(sanitizeReturnTo('/bikes?category=ENDURO#simulator')).toBe(
      '/bikes?category=ENDURO#simulator'
    );
    expect(sanitizeReturnTo('/checkout')).toBe('/checkout');

    // Open Redirect & control character attack vectors
    expect(sanitizeReturnTo('https://evil.com')).toBe('/account');
    expect(sanitizeReturnTo('http://evil.com/phish')).toBe('/account');
    expect(sanitizeReturnTo('//evil.com')).toBe('/account');
    expect(sanitizeReturnTo('/\\evil.com')).toBe('/account');
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/account');
    expect(sanitizeReturnTo('/login\r\nSet-Cookie:evil=1')).toBe('/account');
    expect(sanitizeReturnTo(`/${'a'.repeat(300)}`)).toBe('/account');
    expect(sanitizeReturnTo(null)).toBe('/account');
    expect(sanitizeReturnTo('')).toBe('/account');
  });
});
