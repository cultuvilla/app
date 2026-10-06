/* eslint-disable @typescript-eslint/no-non-null-assertion */
// This file exercises newsService against an in-memory Firestore fake (see
// ../helpers/fakeFirestore) so the service functions can run without a real
// Firebase project or emulator. The typed refs in src/firebase/refs/client call
// .withConverter() on every collection/doc — the fake's collection/doc factories
// return objects with a no-op .withConverter so the refs stay structurally
// compatible with the rest of the mocked API.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());

// ─── Import service under test ─────────────────────────────────────────────────
import {
  createNewsPost,
  getNewsPost,
  getNewsPostsByMunicipality,
  getNewsPostsByOrganizer,
  watchNewsPostsByOrganizer,
  updateNewsPost,
  getHomeFeed,
  getAllVillagesFeed,
  getOtherVillagesFeed,
} from '../../src/services/newsService';
import { rememberVillageSlug } from '../../src/services/municipalityService';

// ─── Task 9: CRUD ─────────────────────────────────────────────────────────────

describe('newsService — Task 9: CRUD', () => {
  beforeEach(() => {
    rememberVillageSlug('m1', 'villa');
    rememberVillageSlug('m2', 'otra');
    rememberVillageSlug('m3', 'tercera');
    resetFakeFirestore();
  });

  it('createNewsPost writes a doc with organizerUserIds/organizerOrgIds', async () => {
    const id = await createNewsPost({
      municipalityId: 'm1',
      createdBy: 'u1',
      organizerUserIds: ['u1'],
      organizerOrgIds: [],
      title: 'Fiesta del pueblo',
      body: 'Detalles aquí',
      category: 'fiesta',
    });

    expect(id).toBeTruthy();
    const snap = fakeStore()[`news/${id}`];
    expect(snap).toBeDefined();
    expect(snap['status']).toBe('active');
    expect(snap['publishedAt']).toBeInstanceOf(Date);
    expect(snap['organizerUserIds']).toEqual(['u1']);
    expect(snap['organizerOrgIds']).toEqual([]);
    expect(snap['readCount']).toBe(0);
    expect(snap['commentCount']).toBe(0);
    expect(snap['municipalityId']).toBe('m1');
    expect(snap['createdBy']).toBe('u1');
    expect(snap['images']).toEqual([]);
    expect(snap['createdAt']).toBeInstanceOf(Date);
    expect(snap['updatedAt']).toBeInstanceOf(Date);
    // old fields must be absent
    expect(snap['authorUserId']).toBeUndefined();
    expect(snap['authorOrgId']).toBeUndefined();
  });

  it('createNewsPost passes organizerOrgIds when provided', async () => {
    const id = await createNewsPost({
      municipalityId: 'm1',
      createdBy: 'u1',
      organizerUserIds: ['u1'],
      organizerOrgIds: ['org1'],
      title: 'T',
      body: 'B',
      category: 'otro',
    });
    expect(fakeStore()[`news/${id}`]['organizerOrgIds']).toEqual(['org1']);
  });

  it('getNewsPost returns mapped doc', async () => {
    const id = await createNewsPost({
      municipalityId: 'm1',
      createdBy: 'u1',
      organizerUserIds: ['u1'],
      organizerOrgIds: [],
      title: 'T',
      body: 'B',
      category: 'historia',
    });
    const post = await getNewsPost(id);
    expect(post).not.toBeNull();
    expect(post!.id).toBe(id);
    expect(post!.title).toBe('T');
    expect(post!.status).toBe('active');
  });

  it('getNewsPost returns null for missing doc', async () => {
    const result = await getNewsPost('nonexistent-id');
    expect(result).toBeNull();
  });

  it('getNewsPostsByMunicipality returns posts for that municipality', async () => {
    await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'A', body: 'B', category: 'fiesta' });
    await createNewsPost({ municipalityId: 'm2', createdBy: 'u2', organizerUserIds: ['u2'], organizerOrgIds: [], title: 'C', body: 'D', category: 'otro' });

    const posts = await getNewsPostsByMunicipality('m1');
    expect(posts.length).toBe(1);
    expect(posts[0].municipalityId).toBe('m1');
  });

  it('getNewsPostsByMunicipality filters by status', async () => {
    const id = await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'A', body: 'B', category: 'fiesta' });
    // Manually hide this one
    fakeStore()[`news/${id}`]['status'] = 'hidden';

    await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'B', body: 'C', category: 'fiesta' });

    const hidden = await getNewsPostsByMunicipality('m1', { status: 'hidden' });
    expect(hidden.length).toBe(1);
    expect(hidden[0].id).toBe(id);
  });

  it('getNewsPostsByOrganizer returns posts where user is in organizerUserIds', async () => {
    await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'A', body: 'B', category: 'fiesta' });
    await createNewsPost({ municipalityId: 'm2', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'C', body: 'D', category: 'otro' });
    await createNewsPost({ municipalityId: 'm1', createdBy: 'u2', organizerUserIds: ['u2'], organizerOrgIds: [], title: 'E', body: 'F', category: 'historia' });

    const mine = await getNewsPostsByOrganizer('u1');
    expect(mine.length).toBe(2);
    expect(mine.every((p) => p.organizerUserIds.includes('u1'))).toBe(true);
    expect(await getNewsPostsByOrganizer('nobody')).toEqual([]);
  });

  it('getNewsPostsByOrganizer respects the limit option', async () => {
    await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'A', body: 'B', category: 'fiesta' });
    await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'C', body: 'D', category: 'otro' });
    await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'E', body: 'F', category: 'historia' });

    expect((await getNewsPostsByOrganizer('u1', { limit: 2 })).length).toBe(2);
  });

  it('updateNewsPost updates allowed fields', async () => {
    const id = await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'Old', body: 'B', category: 'fiesta' });
    await updateNewsPost(id, { title: 'New title', body: 'New body' });
    const snap = fakeStore()[`news/${id}`];
    expect(snap['title']).toBe('New title');
    expect(snap['body']).toBe('New body');
  });

  it('updateNewsPost can reassign authorship (organizerUserIds/organizerOrgIds)', async () => {
    const id = await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'T', body: 'B', category: 'fiesta' });
    await updateNewsPost(id, { organizerUserIds: ['u1', 'u2'], organizerOrgIds: ['org1'] });
    const snap = fakeStore()[`news/${id}`];
    expect(snap['organizerUserIds']).toEqual(['u1', 'u2']);
    expect(snap['organizerOrgIds']).toEqual(['org1']);
  });

  it('updateNewsPost throws when trying to modify forbidden field "status"', async () => {
    const id = await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'T', body: 'B', category: 'fiesta' });
    await expect(
      updateNewsPost(id, { title: 'X' })
        .then(() => {
          // @ts-expect-error intentionally passing forbidden field
          return updateNewsPost(id, { status: 'active' });
        })
    ).rejects.toThrow(/status/);
  });
});

describe('getApprovedNewsPostsByOrganizer', () => {
  it('returns only active posts where the user is an organizer, newest first', async () => {
    resetFakeFirestore();
    const store = fakeStore();
    store['news/n1'] = {
      organizerUserIds: ['u1'], status: 'active',
      createdAt: new Date('2026-01-02'),
    };
    store['news/n2'] = {
      organizerUserIds: ['u1'], status: 'hidden',
      createdAt: new Date('2026-01-03'),
    };
    store['news/n3'] = {
      organizerUserIds: ['u1'], status: 'active',
      createdAt: new Date('2026-01-01'),
    };
    store['news/n4'] = {
      organizerUserIds: ['other'], status: 'active',
      createdAt: new Date('2026-01-04'),
    };
    const { getApprovedNewsPostsByOrganizer } = await import(
      '../../src/services/newsService'
    );
    const res = await getApprovedNewsPostsByOrganizer('u1');
    expect(res.map((p) => p.id)).toEqual(['n1', 'n3']);
  });
});

describe('watchNewsPostsByOrganizer', () => {
  beforeEach(() => {
    resetFakeFirestore();
    const store = fakeStore();
    store['news/n1'] = { organizerUserIds: ['u1'], status: 'active', createdAt: new Date('2026-01-02') };
    store['news/n2'] = { organizerUserIds: ['u1'], status: 'hidden', createdAt: new Date('2026-01-03') };
    store['news/n3'] = { organizerUserIds: ['u1'], status: 'active', createdAt: new Date('2026-01-01') };
    store['news/n4'] = { organizerUserIds: ['other'], status: 'active', createdAt: new Date('2026-01-04') };
  });

  function watched(activeOnly: boolean): string[] {
    let ids: string[] = [];
    watchNewsPostsByOrganizer('u1', { activeOnly }, (posts) => (ids = posts.map((p) => p.id)), (e) => {
      throw e;
    });
    return ids;
  }

  it('emits every post the user organizes, any status, newest first', () => {
    expect(watched(false)).toEqual(['n2', 'n1', 'n3']);
  });

  it('emits only active posts in the form safe to run on another user', () => {
    expect(watched(true)).toEqual(['n1', 'n3']);
  });
});

// ─── Task 7: Feed queries ──────────────────────────────────────────────────────

describe('newsService — Task 7: Feed queries', () => {
  beforeEach(() => {
    rememberVillageSlug('m1', 'villa');
    rememberVillageSlug('m2', 'otra');
    rememberVillageSlug('m3', 'tercera');
    resetFakeFirestore();
  });

  async function seedApprovedPost(municipalityId: string, title: string) {
    const id = await createNewsPost({ municipalityId, createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title, body: 'B', category: 'fiesta' });
    fakeStore()[`news/${id}`]['status'] = 'active';
    fakeStore()[`news/${id}`]['publishedAt'] = new Date(2024, 1, 1);
    return id;
  }

  it('getHomeFeed returns only active posts for the home municipality', async () => {
    const id1 = await seedApprovedPost('m1', 'Home 1');
    const id2 = await seedApprovedPost('m1', 'Home 2');
    // hidden post in home
    const hiddenId = await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'Hidden', body: 'B', category: 'fiesta' });
    fakeStore()[`news/${hiddenId}`]['status'] = 'hidden';
    fakeStore()[`news/${hiddenId}`]['publishedAt'] = new Date(2024, 1, 1);
    // active post in other municipality
    await seedApprovedPost('m2', 'Other');

    const feed = await getHomeFeed('m1');
    const ids = feed.map((p) => p.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids).not.toContain(hiddenId);
    expect(feed.every((p) => p.municipalityId === 'm1')).toBe(true);
    expect(feed.every((p) => p.status === 'active')).toBe(true);
  });

  it('getAllVillagesFeed returns active posts across every municipality', async () => {
    const id1 = await seedApprovedPost('m1', 'Home');
    const id2 = await seedApprovedPost('m2', 'Other');
    // hidden post anywhere should be excluded
    const hiddenId = await createNewsPost({ municipalityId: 'm1', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'Hidden', body: 'B', category: 'fiesta' });
    fakeStore()[`news/${hiddenId}`]['status'] = 'hidden';

    const feed = await getAllVillagesFeed();
    const ids = feed.map((p) => p.id);
    expect(ids).toContain(id1);
    expect(ids).toContain(id2);
    expect(ids).not.toContain(hiddenId);
    expect(feed.every((p) => p.status === 'active')).toBe(true);
  });

  it('getOtherVillagesFeed returns active posts excluding home municipality', async () => {
    await seedApprovedPost('m1', 'Home post');
    const id2 = await seedApprovedPost('m2', 'Other 1');
    const id3 = await seedApprovedPost('m3', 'Other 2');
    // hidden in m2 should be excluded
    const hiddenId = await createNewsPost({ municipalityId: 'm2', createdBy: 'u1', organizerUserIds: ['u1'], organizerOrgIds: [], title: 'Hidden m2', body: 'B', category: 'fiesta' });
    fakeStore()[`news/${hiddenId}`]['status'] = 'hidden';

    const feed = await getOtherVillagesFeed('m1');
    const ids = feed.map((p) => p.id);
    expect(ids).toContain(id2);
    expect(ids).toContain(id3);
    expect(ids).not.toContain(hiddenId);
    expect(feed.every((p) => p.municipalityId !== 'm1')).toBe(true);
    expect(feed.every((p) => p.status === 'active')).toBe(true);
  });
});
