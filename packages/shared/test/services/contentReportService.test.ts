// Exercises contentReportService + blockedUserService against the shared
// in-memory Firestore fake (see ../helpers/fakeFirestore).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeFirestoreModule, resetFakeFirestore, fakeStore } from '../helpers/fakeFirestore';

vi.mock('../../src/firebase', () => ({ getDb: () => ({}), getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => createFakeFirestoreModule());

import {
  createContentReport,
  getOpenReports,
  getReportsByMunicipality,
  setReportStatus,
} from '../../src/services/contentReportService';
import {
  blockUser,
  unblockUser,
  getBlockedUserIds,
} from '../../src/services/blockedUserService';
import { buildContentReportData } from '../../src/models/moderation/ContentReportDataModel';

describe('contentReportService', () => {
  beforeEach(() => {
    resetFakeFirestore();
  });

  it('createContentReport writes an open report carrying the target and reporter', async () => {
    const id = await createContentReport({
      municipalityId: 'm1',
      targetKind: 'comment',
      targetId: 'c1',
      targetAuthorUserId: 'author-1',
      reporterUserId: 'reporter-1',
      reason: 'harassment',
    });
    const doc = fakeStore()[`contentReports/${id}`];
    expect(doc).toBeDefined();
    expect(doc['targetKind']).toBe('comment');
    expect(doc['targetId']).toBe('c1');
    expect(doc['targetAuthorUserId']).toBe('author-1');
    expect(doc['reporterUserId']).toBe('reporter-1');
    expect(doc['reason']).toBe('harassment');
    // A reporter can never file something pre-resolved.
    expect(doc['status']).toBe('open');
  });

  it('getReportsByMunicipality returns only that village, filtered by status', async () => {
    await createContentReport({
      municipalityId: 'm1', targetKind: 'news', targetId: 'n1',
      reporterUserId: 'r1', reason: 'spam',
    });
    const otherId = await createContentReport({
      municipalityId: 'm2', targetKind: 'news', targetId: 'n2',
      reporterUserId: 'r1', reason: 'spam',
    });
    const reviewed = await createContentReport({
      municipalityId: 'm1', targetKind: 'news', targetId: 'n3',
      reporterUserId: 'r1', reason: 'spam',
    });
    await setReportStatus(reviewed, 'reviewed');

    const open = await getReportsByMunicipality('m1', { status: 'open' });
    expect(open.map((r) => r.targetId)).toEqual(['n1']);
    expect(open.map((r) => r.id)).not.toContain(otherId);
  });

  it('getOpenReports spans every village and leaves out the resolved ones', async () => {
    const file = (municipalityId: string) =>
      createContentReport({
        municipalityId,
        targetKind: 'comment',
        targetId: 'c1',
        reporterUserId: 'reporter-1',
        reason: 'harassment',
      });
    await file('m1');
    await file('m2');
    await setReportStatus(await file('m1'), 'reviewed');

    const open = await getOpenReports();
    expect(open.map((r) => r.municipalityId).sort()).toEqual(['m1', 'm2']);
  });

  it('setReportStatus moves a report out of the open queue', async () => {
    const id = await createContentReport({
      municipalityId: 'm1', targetKind: 'comment', targetId: 'c1',
      reporterUserId: 'r1', reason: 'other',
    });
    await setReportStatus(id, 'dismissed');
    expect(fakeStore()[`contentReports/${id}`]['status']).toBe('dismissed');
  });
});

describe('buildContentReportData', () => {
  it('defaults the optional fields rather than dropping them', () => {
    const d = buildContentReportData({
      municipalityId: 'm1', targetKind: 'person', targetId: 'p1',
      reporterUserId: 'r1', reason: 'hate',
    });
    expect(d.targetAuthorUserId).toBeNull();
    expect(d.note).toBeNull();
    expect(d.status).toBe('open');
  });

  it('trims a note and treats whitespace-only as absent', () => {
    expect(buildContentReportData({
      municipalityId: 'm1', targetKind: 'person', targetId: 'p1',
      reporterUserId: 'r1', reason: 'hate', note: '  molesta  ',
    }).note).toBe('molesta');
    expect(buildContentReportData({
      municipalityId: 'm1', targetKind: 'person', targetId: 'p1',
      reporterUserId: 'r1', reason: 'hate', note: '   ',
    }).note).toBeNull();
  });
});

describe('blockedUserService', () => {
  beforeEach(() => {
    resetFakeFirestore();
  });

  it('blockUser keys the doc by the blocked uid, so blocking twice is one doc', async () => {
    await blockUser('me', 'them');
    await blockUser('me', 'them');
    expect(fakeStore()['users/me/blockedUsers/them']).toBeDefined();
    expect(await getBlockedUserIds('me')).toEqual(['them']);
  });

  it('refuses to block yourself', async () => {
    await expect(blockUser('me', 'me')).rejects.toThrow();
  });

  it('unblockUser removes the entry', async () => {
    await blockUser('me', 'them');
    await unblockUser('me', 'them');
    expect(await getBlockedUserIds('me')).toEqual([]);
  });

  it('block lists are per-user — mine does not leak into yours', async () => {
    await blockUser('me', 'them');
    expect(await getBlockedUserIds('you')).toEqual([]);
  });
});
