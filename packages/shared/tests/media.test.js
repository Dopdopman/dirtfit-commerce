import { describe, expect, it } from 'vitest';
import {
  AccessoryMediaConfirmSchema,
  AccessoryMediaPresignSchema,
  BikeMediaConfirmBodySchema,
  BikeMediaPresignBodySchema,
  BikeMediaReorderSchema,
  IMAGE_KINDS,
  buildAccessoryProductUrl,
  buildBikeProductUrl,
  isPlaceholderMediaUrl,
  isSafeImageUrl,
  resolveAccessoryMedia,
  resolveBikeMedia,
} from '../src/index.js';

describe('@dirtfit/shared v2.1 Media Helpers & Schemas', () => {
  it('flags seeded placeholder hosts and unsafe image URLs cleanly', () => {
    expect(isPlaceholderMediaUrl(null)).toBe(true);
    expect(isPlaceholderMediaUrl('')).toBe(true);
    expect(isPlaceholderMediaUrl('https://cdn.dirtfit.vn/bikes/ktm-350-exc-f/hero.webp')).toBe(
      true
    );
    expect(isPlaceholderMediaUrl('https://example.com/demo.png')).toBe(true);
    expect(isPlaceholderMediaUrl('https://pub-abc123.r2.dev/bikes/1/photos/pic.webp')).toBe(false);
    expect(isPlaceholderMediaUrl('http://localhost:4000/api/v1/media/local/bikes/1/a.png')).toBe(
      false
    );

    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeImageUrl('https://pub-abc123.r2.dev/accessories/1/pic.png')).toBe(true);
    expect(isSafeImageUrl('http://127.0.0.1:4000/api/v1/media/local/test.jpg')).toBe(true);
  });

  it('resolves BikeMedia fallback hierarchy strictly separating commercial photos from 2D blueprints', () => {
    // 1. Seeded placeholders only -> commercial PLACEHOLDER, null URLs (no browser ERR_NAME_NOT_RESOLVED spam)
    const seedOnly = resolveBikeMedia([
      {
        id: '1',
        url: 'https://cdn.dirtfit.vn/bikes/ktm-350-exc-f/hero.webp',
        mediaType: 'HERO',
        isPrimary: true,
        sortOrder: 0,
      },
      {
        id: '2',
        url: 'https://cdn.dirtfit.vn/bikes/ktm-350-exc-f/blueprint.png',
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        isPrimary: true,
        sortOrder: 1,
      },
    ]);
    expect(seedOnly.coverImageUrl).toBeNull();
    expect(seedOnly.commercialImageUrl).toBeNull();
    expect(seedOnly.commercialImageKind).toBe(IMAGE_KINDS.PLACEHOLDER);
    expect(seedOnly.galleryImages).toHaveLength(0);
    expect(seedOnly.blueprintImageUrl).toBeNull();
    expect(seedOnly.primaryBlueprint?.id).toBe('2');

    // 2. Live 2D blueprint only -> commercialImageUrl uses blueprint with BLUEPRINT kind
    const blueprintOnly = resolveBikeMedia([
      {
        id: 'bp-1',
        url: 'https://pub-r2.r2.dev/bikes/b1/blueprint/1111.png',
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        isPrimary: true,
        sortOrder: 0,
      },
    ]);
    expect(blueprintOnly.coverImageUrl).toBeNull();
    expect(blueprintOnly.commercialImageUrl).toBe(
      'https://pub-r2.r2.dev/bikes/b1/blueprint/1111.png'
    );
    expect(blueprintOnly.commercialImageKind).toBe(IMAGE_KINDS.BLUEPRINT);
    expect(blueprintOnly.blueprintImageUrl).toBe(
      'https://pub-r2.r2.dev/bikes/b1/blueprint/1111.png'
    );

    // 3. Soft-deleted cover ignored + real GALLERY primary + non-primary ordering preserved + blueprint isolated
    const fullMedia = resolveBikeMedia([
      {
        id: 'deleted-1',
        url: 'https://pub-r2.r2.dev/bikes/b1/photos/deleted.jpg',
        mediaType: 'HERO',
        isPrimary: true,
        sortOrder: 0,
        deletedAt: '2026-11-25T10:00:00.000Z',
      },
      {
        id: 'gal-2',
        url: 'https://pub-r2.r2.dev/bikes/b1/photos/gal2.jpg',
        mediaType: 'GALLERY',
        isPrimary: false,
        sortOrder: 2,
      },
      {
        id: 'gal-cover',
        url: 'https://pub-r2.r2.dev/bikes/b1/photos/cover.webp',
        mediaType: 'GALLERY',
        isPrimary: true,
        sortOrder: 5,
      },
      {
        id: 'bp-live',
        url: 'https://pub-r2.r2.dev/bikes/b1/blueprint/bp.png',
        mediaType: 'SIDE_PROFILE_BLUEPRINT',
        isPrimary: true,
        sortOrder: 0,
      },
    ]);

    expect(fullMedia.coverImageUrl).toBe('https://pub-r2.r2.dev/bikes/b1/photos/cover.webp');
    expect(fullMedia.commercialImageKind).toBe(IMAGE_KINDS.PHOTO);
    expect(fullMedia.primaryPhoto?.id).toBe('gal-cover');
    expect(fullMedia.galleryImages.map((g) => g.id)).toEqual(['gal-cover', 'gal-2']);
    expect(fullMedia.blueprintImageUrl).toBe('https://pub-r2.r2.dev/bikes/b1/blueprint/bp.png');
  });

  it('resolves Accessory media and canonical Storefront deep-link product URLs', () => {
    expect(resolveAccessoryMedia(null)).toEqual({
      imageUrl: null,
      imageKind: IMAGE_KINDS.PLACEHOLDER,
    });
    expect(
      resolveAccessoryMedia({ imageUrl: 'https://cdn.dirtfit.vn/accessories/placeholder.png' })
    ).toEqual({
      imageUrl: null,
      imageKind: IMAGE_KINDS.PLACEHOLDER,
    });
    expect(
      resolveAccessoryMedia({ imageUrl: 'http://localhost:4000/api/v1/media/local/acc.webp' })
    ).toEqual({
      imageUrl: 'http://localhost:4000/api/v1/media/local/acc.webp',
      imageKind: IMAGE_KINDS.PHOTO,
    });

    expect(buildBikeProductUrl('ktm-350-exc-f')).toBe('/bikes/ktm-350-exc-f');
    expect(buildBikeProductUrl('')).toBe('/bikes');
    expect(buildAccessoryProductUrl('ACC-ZETA-LINK-30')).toBe('/accessories?sku=ACC-ZETA-LINK-30');
    expect(buildAccessoryProductUrl('SKU #1')).toBe('/accessories?sku=SKU%20%231');
    expect(buildAccessoryProductUrl('')).toBe('/accessories');
  });

  it('validates v2.1 Bike Gallery and Accessory Media Zod .strict() schemas', () => {
    const validPresign = BikeMediaPresignBodySchema.safeParse({
      mediaType: 'GALLERY',
      mimeType: 'image/webp',
      sizeBytes: 102400,
    });
    expect(validPresign.success).toBe(true);

    const extraFieldPresign = BikeMediaPresignBodySchema.safeParse({
      mediaType: 'GALLERY',
      mimeType: 'image/webp',
      sizeBytes: 102400,
      bikeId: '11111111-1111-4111-8111-111111111111',
    });
    expect(extraFieldPresign.success).toBe(false);

    const confirmRes = BikeMediaConfirmBodySchema.safeParse({
      storageKey: 'bikes/11111111-1111-4111-8111-111111111111/photos/2222.png',
      declaredMimeType: 'image/png',
      mediaType: 'HERO',
      isPrimary: true,
    });
    expect(confirmRes.success).toBe(true);

    const reorderValid = BikeMediaReorderSchema.safeParse({
      orderedMediaIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    });
    expect(reorderValid.success).toBe(true);
    expect(BikeMediaReorderSchema.safeParse({ orderedMediaIds: [] }).success).toBe(false);

    expect(
      AccessoryMediaPresignSchema.safeParse({ mimeType: 'image/svg+xml', sizeBytes: 512 }).success
    ).toBe(false);
    expect(
      AccessoryMediaPresignSchema.safeParse({
        mimeType: 'image/jpeg',
        sizeBytes: 5 * 1024 * 1024 + 1,
      }).success
    ).toBe(false);
    expect(
      AccessoryMediaConfirmSchema.safeParse({
        storageKey: 'accessories/11111111-1111-4111-8111-111111111111/2222.png',
        declaredMimeType: 'image/png',
      }).success
    ).toBe(true);
  });
});
