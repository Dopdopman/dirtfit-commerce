import { describe, expect, it } from 'vitest';
import { MEDIA_TYPES } from '@dirtfit/shared';
import {
  buildSafeAccessoryStorageKey,
  buildSafeBikeStorageKey,
  validateAnySafeStorageKey,
  validateSafeAccessoryStorageKey,
  validateSafeBikeStorageKey,
} from '../../src/common/storage/magic-bytes.js';

const BIKE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '99999999-9999-4999-8999-999999999999';
const ACC_ID = '22222222-2222-4222-8222-222222222222';

describe('Media Storage Keys & Path-Traversal Defense (Pure JS Unit)', () => {
  it('builds categorized storage keys for bike photos, blueprints, specs, and accessories', () => {
    const photoKey = buildSafeBikeStorageKey(BIKE_ID, MEDIA_TYPES.GALLERY, 'image/webp');
    const blueprintKey = buildSafeBikeStorageKey(
      BIKE_ID,
      MEDIA_TYPES.SIDE_PROFILE_BLUEPRINT,
      'image/png'
    );
    const specKey = buildSafeBikeStorageKey(BIKE_ID, MEDIA_TYPES.SPEC_SHEET, 'image/jpeg');
    const accKey = buildSafeAccessoryStorageKey(ACC_ID, 'image/png');

    expect(photoKey.startsWith(`bikes/${BIKE_ID}/photos/`)).toBe(true);
    expect(photoKey.endsWith('.webp')).toBe(true);
    expect(blueprintKey.startsWith(`bikes/${BIKE_ID}/blueprint/`)).toBe(true);
    expect(specKey.startsWith(`bikes/${BIKE_ID}/specs/`)).toBe(true);
    expect(accKey.startsWith(`accessories/${ACC_ID}/`)).toBe(true);

    expect(validateSafeBikeStorageKey(photoKey, BIKE_ID)).toBe(true);
    expect(validateSafeBikeStorageKey(blueprintKey, BIKE_ID)).toBe(true);
    expect(validateSafeAccessoryStorageKey(accKey, ACC_ID)).toBe(true);
    expect(validateAnySafeStorageKey(photoKey)).toBe(true);
    expect(validateAnySafeStorageKey(accKey)).toBe(true);
  });

  it('supports legacy flat bike keys while blocking traversal, wrong owner, and SVG extensions', () => {
    const legacyKey = `bikes/${BIKE_ID}/33333333-3333-4333-8333-333333333333.png`;
    expect(validateSafeBikeStorageKey(legacyKey, BIKE_ID)).toBe(true);
    expect(validateAnySafeStorageKey(legacyKey)).toBe(true);

    // Wrong bike / accessory ID
    expect(validateSafeBikeStorageKey(legacyKey, OTHER_ID)).toBe(false);
    expect(
      validateSafeAccessoryStorageKey(
        `accessories/${ACC_ID}/44444444-4444-4444-8444-444444444444.png`,
        OTHER_ID
      )
    ).toBe(false);

    // Path traversal & disallowed extensions
    expect(validateAnySafeStorageKey(`bikes/${BIKE_ID}/../etc/passwd.png`)).toBe(false);
    expect(
      validateSafeBikeStorageKey(
        `bikes/${BIKE_ID}/photos/44444444-4444-4444-8444-444444444444.svg`,
        BIKE_ID
      )
    ).toBe(false);
    expect(validateAnySafeStorageKey('arbitrary/path/evil.html')).toBe(false);
  });
});
