import { describe, expect, it } from 'vitest';
import {
  getAccessoryCardMedia,
  getBikeCardMedia,
  resolveClientMediaUrl,
  resolveItemProductUrl,
  validateImageFileForUpload,
} from '../src/lib/media-helpers.js';

describe('@dirtfit/web media helpers', () => {
  it('resolves local relative media paths against API base URL and blocks dead placeholders', () => {
    expect(
      resolveClientMediaUrl(
        '/api/v1/media/local/bikes/id/photos/photo.webp',
        'http://localhost:4000'
      )
    ).toBe('http://localhost:4000/api/v1/media/local/bikes/id/photos/photo.webp');

    expect(
      resolveClientMediaUrl('https://pub-demo.r2.dev/accessories/link.png', 'http://localhost:4000')
    ).toBe('https://pub-demo.r2.dev/accessories/link.png');

    expect(resolveClientMediaUrl('https://cdn.dirtfit.vn/bikes/ktm/hero.webp')).toBeNull();
    expect(resolveClientMediaUrl('javascript:alert(1)')).toBeNull();
    expect(resolveClientMediaUrl('')).toBeNull();
  });

  it('extracts bike cover and gallery images while excluding dead placeholders and blueprints', () => {
    const resolved = getBikeCardMedia(
      {
        name: 'KTM 350 EXC-F',
        media: [
          {
            id: 'dead-hero',
            mediaType: 'HERO',
            isPrimary: true,
            url: 'https://cdn.dirtfit.vn/bikes/ktm/hero.webp',
          },
          {
            id: 'bp-1',
            mediaType: 'SIDE_PROFILE_BLUEPRINT',
            isPrimary: true,
            url: '/api/v1/media/local/bikes/ktm/blueprint/side.png',
          },
          {
            id: 'real-gal',
            mediaType: 'GALLERY',
            isPrimary: false,
            sortOrder: 1,
            url: '/api/v1/media/local/bikes/ktm/photos/side.webp',
          },
        ],
      },
      'http://127.0.0.1:4000'
    );

    expect(resolved.hasRealPhoto).toBe(true);
    expect(resolved.coverUrl).toBe(
      'http://127.0.0.1:4000/api/v1/media/local/bikes/ktm/photos/side.webp'
    );
    expect(resolved.galleryImages).toHaveLength(1);
    expect(resolved.blueprintUrl).toBe(
      'http://127.0.0.1:4000/api/v1/media/local/bikes/ktm/blueprint/side.png'
    );
  });

  it('resolves accessory live photo vs placeholder and builds canonical product deep-links', () => {
    expect(
      getAccessoryCardMedia(
        { imageUrl: '/api/v1/media/local/accessories/1/photo.png' },
        'http://localhost:4000'
      )
    ).toEqual({
      imageUrl: 'http://localhost:4000/api/v1/media/local/accessories/1/photo.png',
      hasRealPhoto: true,
      imageKind: 'PHOTO',
    });

    expect(getAccessoryCardMedia({ imageUrl: 'https://cdn.dirtfit.vn/acc/link.png' })).toEqual({
      imageUrl: null,
      hasRealPhoto: false,
      imageKind: 'PLACEHOLDER',
    });

    expect(resolveItemProductUrl({ itemType: 'BIKE', slug: 'ktm-350-exc-f' })).toBe(
      '/bikes/ktm-350-exc-f'
    );

    expect(resolveItemProductUrl({ itemType: 'ACCESSORY', skuSnapshot: 'ACC-ZETA-LINK-30' })).toBe(
      '/accessories?sku=ACC-ZETA-LINK-30'
    );
  });

  it('validates allowed image MIME types and 5MB max size before presigning', () => {
    expect(validateImageFileForUpload({ type: 'image/webp', size: 120000 })).toEqual({
      valid: true,
      mimeType: 'image/webp',
      sizeBytes: 120000,
    });

    expect(validateImageFileForUpload({ type: 'image/svg+xml', size: 2000 })).toEqual({
      valid: false,
      errorCode: 'INVALID_TYPE',
    });

    expect(validateImageFileForUpload({ type: 'image/png', size: 6 * 1024 * 1024 })).toEqual({
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
    });

    expect(validateImageFileForUpload({ type: 'image/png', size: 0 })).toEqual({
      valid: false,
      errorCode: 'EMPTY_FILE',
    });
  });
});
