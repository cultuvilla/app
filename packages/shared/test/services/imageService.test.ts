import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/firebase', () => ({
  getFirebaseStorage: () => ({}),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

import { validateUploadableImage } from '../../src/services/imageService';

// The web `File` API is not available in node-vitest. `validateUploadableImage`
// is the pure validator used by both upload paths and must work on any Blob,
// which is what RN's `fetch(uri).then(r => r.blob())` returns.
describe('validateUploadableImage', () => {
  function makeBlob(opts: { size: number; type: string }): Blob {
    // Only the reported size matters, so the blob holds no bytes.
    return Object.defineProperty(new Blob([], { type: opts.type }), 'size', { value: opts.size });
  }

  it('accepts a small image/jpeg blob', () => {
    expect(() =>
      { validateUploadableImage({
        blob: makeBlob({ size: 1024, type: 'image/jpeg' }),
        filename: 'a.jpg',
      }); },
    ).not.toThrow();
  });

  it('rejects a blob whose declared type is not an image', () => {
    expect(() =>
      { validateUploadableImage({
        blob: makeBlob({ size: 1024, type: 'application/pdf' }),
        filename: 'a.pdf',
      }); },
    ).toThrow(/no es una imagen/);
  });

  it('rejects a blob over 5 MB', () => {
    expect(() =>
      { validateUploadableImage({
        blob: makeBlob({ size: 6 * 1024 * 1024, type: 'image/png' }),
        filename: 'big.png',
      }); },
    ).toThrow(/5 MB/);
  });

  it('honors an explicit contentType override (used by RN when blob.type is empty)', () => {
    expect(() =>
      { validateUploadableImage({
        blob: makeBlob({ size: 1024, type: '' }),
        filename: 'rn.jpg',
        contentType: 'image/jpeg',
      }); },
    ).not.toThrow();
  });

  it('rejects when neither blob.type nor contentType identifies an image', () => {
    expect(() =>
      { validateUploadableImage({
        blob: makeBlob({ size: 1024, type: '' }),
        filename: 'mystery.bin',
      }); },
    ).toThrow(/no es una imagen/);
  });
});

// --- upload metadata -------------------------------------------------------
// Every uploaded object must carry an immutable cacheControl. Without it
// Firebase serves `cache-control: private, max-age=0` and the app re-downloads
// every image on every render pass. Filenames are content-addressed by
// `generateImageId` (timestamp + random), so a stored object is never replaced
// and `immutable` is safe.
describe('upload cache headers', () => {
  it('sets an immutable, year-long cacheControl on every upload path', async () => {
    const storage = await import('firebase/storage');
    const uploadBytes = vi.mocked(storage.uploadBytes);
    const { IMAGE_UPLOAD_CACHE_CONTROL, uploadEventImage, uploadUserPhoto, uploadNewsImage } =
      await import('../../src/services/imageService');

    expect(IMAGE_UPLOAD_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');

    const image = {
      blob: new Blob([new Uint8Array(1024)], { type: 'image/jpeg' }),
      filename: 'a.jpg',
    };
    vi.mocked(storage.getDownloadURL).mockResolvedValue('https://example.test/a');

    for (const upload of [
      () => uploadEventImage('28013', 'e1', image),
      () => uploadUserPhoto('u1', image),
      () => uploadNewsImage('p1', image),
    ]) {
      uploadBytes.mockClear();
      await upload();
      expect(uploadBytes).toHaveBeenCalledTimes(1);
      expect(uploadBytes.mock.calls[0]?.[2]).toMatchObject({
        cacheControl: IMAGE_UPLOAD_CACHE_CONTROL,
      });
    }
  });
});
