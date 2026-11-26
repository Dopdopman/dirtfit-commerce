import { describe, expect, it } from 'vitest';
import {
  detectBrowserImageMime,
  detectImageMimeFromBytes,
  getAccessoryCardMedia,
  getBikeCardMedia,
  inspectImageFileForUpload,
  normalizeFilenameExtension,
  resolveClientMediaUrl,
  resolveItemProductUrl,
  validateImageFileForUpload,
} from '../src/lib/media-helpers.js';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const JPEG_BYTES = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);

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

  it('validates allowed image MIME types and 5MB max size synchronously (legacy helper)', () => {
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

  it('sniffs 16-byte image magic bytes, auto-normalizes WebP disguised as .png/.jpg, and rejects SVG/GIF/AVIF early', async () => {
    expect(detectImageMimeFromBytes(PNG_BYTES)).toBe('image/png');
    expect(detectImageMimeFromBytes(JPEG_BYTES)).toBe('image/jpeg');
    expect(detectImageMimeFromBytes(WEBP_BYTES)).toBe('image/webp');
    expect(detectImageMimeFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();

    expect(normalizeFilenameExtension('crf300l.png', 'image/webp')).toBe('crf300l.webp');
    expect(normalizeFilenameExtension('noextension', 'image/jpeg')).toBe('noextension.jpg');

    const webpDisguisedAsPng = new File([WEBP_BYTES], 'honda-crf300l.png', { type: 'image/png' });
    expect(await detectBrowserImageMime(webpDisguisedAsPng)).toBe('image/webp');

    const normalizedResult = await inspectImageFileForUpload(webpDisguisedAsPng);
    expect(normalizedResult).toEqual({
      valid: true,
      mimeType: 'image/webp',
      declaredMime: 'image/png',
      mimeCorrected: true,
      sizeBytes: WEBP_BYTES.length,
      normalizedFileName: 'honda-crf300l.webp',
    });

    const genuineJpeg = new File([JPEG_BYTES], 'ktm.jpg', { type: 'image/jpeg' });
    expect(await inspectImageFileForUpload(genuineJpeg)).toEqual({
      valid: true,
      mimeType: 'image/jpeg',
      declaredMime: 'image/jpeg',
      mimeCorrected: false,
      sizeBytes: JPEG_BYTES.length,
      normalizedFileName: 'ktm.jpg',
    });

    const fakeSvgAsPng = new File(
      [new TextEncoder().encode('<svg onload=alert(1)></svg>')],
      'xss.png',
      { type: 'image/png' }
    );
    expect(await inspectImageFileForUpload(fakeSvgAsPng)).toEqual({
      valid: false,
      errorCode: 'UNSUPPORTED_BINARY_FORMAT',
      declaredMime: 'image/png',
    });

    const gifBytes = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
    ]);
    expect(
      await inspectImageFileForUpload(new File([gifBytes], 'anim.jpg', { type: 'image/jpeg' }))
    ).toEqual({
      valid: false,
      errorCode: 'UNSUPPORTED_BINARY_FORMAT',
      declaredMime: 'image/jpeg',
    });

    const avifBytes = new TextEncoder().encode(
      '\u0000\u0000\u0000\u001cftypavif\u0000\u0000\u0000\u0000'
    );
    expect(
      await inspectImageFileForUpload(new File([avifBytes], 'modern.png', { type: 'image/png' }))
    ).toEqual({
      valid: false,
      errorCode: 'UNSUPPORTED_BINARY_FORMAT',
      declaredMime: 'image/png',
    });

    expect(await inspectImageFileForUpload(new File([new Uint8Array(8)], 'tiny.png'))).toEqual({
      valid: false,
      errorCode: 'UNSUPPORTED_BINARY_FORMAT',
      declaredMime: null,
    });

    expect(await inspectImageFileForUpload({ type: 'image/png', size: 0 })).toEqual({
      valid: false,
      errorCode: 'EMPTY_FILE',
    });

    expect(await inspectImageFileForUpload({ type: 'image/png', size: 6 * 1024 * 1024 })).toEqual({
      valid: false,
      errorCode: 'FILE_TOO_LARGE',
      declaredMime: 'image/png',
    });
  });
});
