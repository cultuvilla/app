import { describe, it, expect, vi, beforeEach } from 'vitest';

const save = vi.fn();
const file = vi.fn(() => ({ save, download: vi.fn(() => Promise.resolve([Buffer.from('src')])) }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file }) }),
}));

vi.mock('sharp', () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    webp: () => chain,
    toBuffer: () => Promise.resolve(Buffer.from('webp-bytes')),
  };
  return { default: () => chain };
});

import {
  STORAGE_BUCKET_REGION,
  VARIANT_MAX_EDGE,
  downloadTokenOf,
  generateImageVariants,
  variantDecision,
  writeVariants,
} from '../../images/generateImageVariants';

describe('variantDecision', () => {
  it('generates for a normal uploaded image', () => {
    expect(variantDecision('news/p1/images/a.jpg', 'image/jpeg')).toEqual({
      generate: true,
      reason: 'ok',
    });
  });

  it('skips non-images', () => {
    expect(variantDecision('news/p1/x.pdf', 'application/pdf').reason).toBe('not-an-image');
    expect(variantDecision('news/p1/x', undefined).reason).toBe('not-an-image');
  });

  it('skips its own output, which is what stops the trigger recursing', () => {
    expect(variantDecision('news/p1/images/a_card.webp', 'image/webp').reason).toBe(
      'already-a-variant',
    );
    expect(variantDecision('news/p1/images/a_thumb.webp', 'image/webp').reason).toBe(
      'already-a-variant',
    );
  });

  it('skips escudos, which already ship optimised siblings', () => {
    expect(variantDecision('municipalities/01001/escudo.webp', 'image/webp').reason).toBe(
      'exempt-path',
    );
  });

  it('generates for a token-less object', () => {
    // Seed-uploaded images carry a bare `?alt=media` URL served through
    // storage.rules. The rewrite preserves the query string, so those get
    // variants too — they just do not carry a token either.
    expect(variantDecision('news/p1/images/a.jpg', 'image/jpeg').generate).toBe(true);
  });
});

describe('downloadTokenOf', () => {
  it('reads the token from custom metadata', () => {
    expect(downloadTokenOf({ firebaseStorageDownloadTokens: 'abc' })).toBe('abc');
  });

  it('takes the first of a comma-separated list', () => {
    expect(downloadTokenOf({ firebaseStorageDownloadTokens: 'abc,def' })).toBe('abc');
  });

  it('returns undefined when absent or empty', () => {
    expect(downloadTokenOf(undefined)).toBeUndefined();
    expect(downloadTokenOf({})).toBeUndefined();
    expect(downloadTokenOf({ firebaseStorageDownloadTokens: '' })).toBeUndefined();
  });
});

describe('writeVariants', () => {
  beforeEach(() => {
    save.mockClear();
    file.mockClear();
  });

  it('writes one sibling per variant, next to the original', async () => {
    const written = await writeVariants('b', 'news/p1/images/a.jpg', Buffer.from('x'), 'tok');

    expect(written.map((w) => w.path)).toEqual([
      'news/p1/images/a_card.webp',
      'news/p1/images/a_thumb.webp',
    ]);
  });

  it('copies the original download token onto every variant', async () => {
    // A token bypasses storage.rules, so an auth-gated image's variant is only
    // reachable by the same client if it carries the same token.
    await writeVariants('b', 'news/p1/images/a.jpg', Buffer.from('x'), 'tok');

    for (const call of save.mock.calls) {
      expect(call[1]).toMatchObject({
        contentType: 'image/webp',
        metadata: {
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: { firebaseStorageDownloadTokens: 'tok' },
        },
      });
    }
  });

  it('writes no token when the original has none', async () => {
    await writeVariants('b', 'news/p1/images/a.jpg', Buffer.from('x'), undefined);

    for (const call of save.mock.calls) {
      expect(call[1].metadata).toEqual({
        cacheControl: 'public, max-age=31536000, immutable',
      });
    }
  });

  it('keeps the thumb budget well below the card budget', () => {
    expect(VARIANT_MAX_EDGE.thumb).toBeLessThan(VARIANT_MAX_EDGE.card);
  });
});

describe('trigger region', () => {
  it('is pinned to the bucket region, not the us-central1 default', () => {
    // A Storage trigger must live in its bucket's region. All three envs'
    // default buckets are US-EAST1, so leaving the function on the
    // us-central1 default fails the entire `firebase deploy` with
    // "A function in region us-central1 cannot listen to a bucket in region
    // us-east1" — taking every other function's deploy down with it.
    expect(STORAGE_BUCKET_REGION).toBe('us-east1');

    expect(generateImageVariants.__endpoint.region).toEqual(['us-east1']);
  });
});
