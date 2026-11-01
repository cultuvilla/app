import { describe, it, expect, vi, beforeEach } from 'vitest';

const deleteFile = vi.fn((_opts?: unknown) => Promise.resolve());
const file = vi.fn((_path: string) => ({ delete: deleteFile }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file }) }),
}));

import {
  ENTITY_IMAGE_SOURCES,
  handleEntityImagesWritten,
  objectsForImage,
  ownedImagePaths,
  removedImagePaths,
  type EntityImageSource,
} from '../../images/cleanupRemovedImages';

const url = (path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/bkt/o/${encodeURIComponent(path)}?alt=media&token=t`;

type Params = Record<string, string>;

function writeEvent(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined, params: Params) {
  const snap = (data: Record<string, unknown> | undefined) => ({ data: () => data, exists: data !== undefined });
  return { data: { before: snap(before), after: snap(after) }, params } as unknown as Parameters<
    typeof handleEntityImagesWritten
  >[1];
}

describe('ownedImagePaths', () => {
  it('reads every news reference: legacy images, cover and inline image blocks', () => {
    const paths = ownedImagePaths(
      ENTITY_IMAGE_SOURCES.news,
      {
        images: [{ storagePath: 'news/p1/images/a.jpg' }],
        coverImage: { storagePath: 'news/p1/images/cover.jpg' },
        content: [
          { type: 'text', text: 'hola' },
          { type: 'image', storagePath: 'news/p1/images/b.webp' },
        ],
      },
      { entityId: 'p1' },
    );
    expect([...paths].sort()).toEqual([
      'news/p1/images/a.jpg',
      'news/p1/images/b.webp',
      'news/p1/images/cover.jpg',
    ]);
  });

  it('parses download URLs, including the municipality segment events do not carry in their doc path', () => {
    const path = 'municipalities/m1/events/e1/image/x.jpg';
    expect([...ownedImagePaths(ENTITY_IMAGE_SOURCES.events, { imageURL: url(path) }, { entityId: 'e1' })]).toEqual([
      path,
    ]);
  });

  it('never claims the cover of a series occurrence, which its siblings share', () => {
    const path = 'municipalities/m1/events/e1/image/x.jpg';
    const data = { imageURL: url(path), series: { id: 's1', index: 0, weekdays: [2], until: new Date() } };
    expect(ownedImagePaths(ENTITY_IMAGE_SOURCES.events, data, { entityId: 'e1' }).size).toBe(0);
  });

  it("never claims a yearly event's cover, which next year's edition reuses", () => {
    const path = 'municipalities/m1/events/e1/image/x.jpg';
    const data = { imageURL: url(path), series: null, repeatsYearly: true };
    expect(ownedImagePaths(ENTITY_IMAGE_SOURCES.events, data, { entityId: 'e1' }).size).toBe(0);
  });

  it("never claims a monthly event's cover, which the next edition reuses", () => {
    const path = 'municipalities/m1/events/e1/image/x.jpg';
    const data = { imageURL: url(path), series: null, repeatsMonthly: true };
    expect(ownedImagePaths(ENTITY_IMAGE_SOURCES.events, data, { entityId: 'e1' }).size).toBe(0);
  });

  it('never claims an image stored under another entity', () => {
    // A copied URL or another entity's upload is not this doc's to delete.
    const foreign = [
      url('organizations/other/image/x.jpg'),
      url('organizations/o1-suffix/image/x.jpg'),
      url('users/u1/photo/x.jpg'),
      'https://picsum.photos/200',
    ];
    expect(ownedImagePaths(ENTITY_IMAGE_SOURCES.organizations, { images: foreign }, { entityId: 'o1' }).size).toBe(0);
  });

  it('reads history entries from {url, caption} objects', () => {
    const path = 'historyEntries/m1/h1/a.jpg';
    expect([
      ...ownedImagePaths(ENTITY_IMAGE_SOURCES.historyEntries, { images: [{ url: url(path), caption: 'x' }] }, { entityId: 'h1' }),
    ]).toEqual([path]);
  });

  it('matches place and barrio uploads under their own municipality only', () => {
    const params = { municipalityId: 'm1', entityId: 'pl1' };
    const mine = 'municipalities/m1/places/pl1/image/a.jpg';
    const elsewhere = 'municipalities/m2/places/pl1/image/a.jpg';
    expect([...ownedImagePaths(ENTITY_IMAGE_SOURCES.places, { images: [url(mine), url(elsewhere)] }, params)]).toEqual([
      mine,
    ]);
  });

  it('tolerates a doc with malformed or missing image fields', () => {
    expect(ownedImagePaths(ENTITY_IMAGE_SOURCES.news, { content: 'nope', coverImage: null }, { entityId: 'p1' }).size).toBe(0);
    expect(ownedImagePaths(ENTITY_IMAGE_SOURCES.festivalPosters, undefined, { entityId: 'f1' }).size).toBe(0);
  });
});

describe('removedImagePaths', () => {
  const source: EntityImageSource = ENTITY_IMAGE_SOURCES.festivalPosters;
  const params = { entityId: 'f1' };
  const a = url('festivalPosters/m1/f1/a.jpg');
  const b = url('festivalPosters/m1/f1/b.jpg');

  it('returns every owned image when the doc is deleted', () => {
    expect(removedImagePaths(source, { images: [a, b] }, undefined, params)).toEqual([
      'festivalPosters/m1/f1/a.jpg',
      'festivalPosters/m1/f1/b.jpg',
    ]);
  });

  it('returns only the images an edit dropped', () => {
    expect(removedImagePaths(source, { images: [a, b] }, { images: [b] }, params)).toEqual([
      'festivalPosters/m1/f1/a.jpg',
    ]);
  });

  it('returns nothing on create or when images are only reordered', () => {
    expect(removedImagePaths(source, undefined, { images: [a] }, params)).toEqual([]);
    expect(removedImagePaths(source, { images: [a, b] }, { images: [b, a] }, params)).toEqual([]);
  });

  it('treats a token change on the same object as the same image', () => {
    const rotated = a.replace('token=t', 'token=other');
    expect(removedImagePaths(source, { images: [a] }, { images: [rotated] }, params)).toEqual([]);
  });
});

describe('objectsForImage', () => {
  it('includes the generated variants beside the original', () => {
    expect(objectsForImage('news/p1/images/a.jpg')).toEqual([
      'news/p1/images/a.jpg',
      'news/p1/images/a_card.webp',
      'news/p1/images/a_thumb.webp',
    ]);
  });
});

describe('handleEntityImagesWritten', () => {
  beforeEach(() => {
    file.mockClear();
    deleteFile.mockReset();
    deleteFile.mockResolvedValue(undefined);
  });

  it('deletes a removed event cover and its variants, ignoring missing variants', async () => {
    const path = 'municipalities/m1/events/e1/image/old.jpg';
    await handleEntityImagesWritten(
      ENTITY_IMAGE_SOURCES.events,
      writeEvent({ imageURL: url(path) }, { imageURL: url('municipalities/m1/events/e1/image/new.jpg') }, { entityId: 'e1' }),
    );
    expect(file.mock.calls.map((c) => c[0])).toEqual(objectsForImage(path));
    expect(deleteFile).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it('touches storage not at all when no owned image was removed', async () => {
    await handleEntityImagesWritten(
      ENTITY_IMAGE_SOURCES.news,
      writeEvent({ title: 'a' }, { title: 'b' }, { entityId: 'p1' }),
    );
    expect(file).not.toHaveBeenCalled();
  });

  it('keeps going when one delete fails', async () => {
    deleteFile.mockRejectedValueOnce(new Error('boom'));
    await expect(
      handleEntityImagesWritten(
        ENTITY_IMAGE_SOURCES.news,
        writeEvent(
          { content: [{ type: 'image', storagePath: 'news/p1/images/a.jpg' }] },
          undefined,
          { entityId: 'p1' },
        ),
      ),
    ).resolves.toBeUndefined();
    expect(file).toHaveBeenCalledTimes(3);
  });
});
