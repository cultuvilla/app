// Trigger tests for syncOrgSocioRoster, driven via firebase-functions-test
// against the Firestore emulator (same harness as syncOrgMemberCount.test.ts).

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncOrgSocioRoster } from '../../../organizations/syncOrgSocioRoster';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncOrgSocioRoster);

const ORG_ID = 'org-1';

interface MemberShape {
  userId: string;
  role: string;
  joinedAt: Date;
}

const JOINED = new Date('2026-03-01T10:00:00Z');

function member(overrides: Partial<MemberShape> = {}): MemberShape {
  return { userId: 'user-1', role: 'member', joinedAt: JOINED, ...overrides };
}

async function fire(before: MemberShape | null, after: MemberShape | null, userId = 'user-1', orgId = ORG_ID) {
  const path = `organizations/${orgId}/members/${userId}`;
  const change = ft.makeChange(
    ft.firestore.makeDocumentSnapshot(before ? { ...before } : {}, path),
    ft.firestore.makeDocumentSnapshot(after ? { ...after } : {}, path),
  );
  await wrapped({ data: change, params: { orgId, userId } } as unknown as Parameters<typeof wrapped>[0]);
}

async function seedOrg(type = 'asociación', id = ORG_ID) {
  await admin.firestore().doc(`organizations/${id}`).set({
    name: 'La Anduela', description: null, images: [], type, status: 'approved', municipalityId: 'mun-1',
    villageSlug: 'villa', requestedBy: 'founder', reviewedBy: null, createdAt: new Date(), reviewedAt: null,
    commentCount: 0, readCount: 0, memberCount: 0, membersPublic: true, joinPolicy: 'open', sociosListVisible: false,
  });
}

async function seedUser(uid: string, personId: string | null, displayName = 'Ana García') {
  await admin.firestore().doc(`users/${uid}`).set({
    displayName, email: `${uid}@x.es`, telephone: null, activeMunicipalityId: null, personId,
    createdAt: new Date(), termsAcceptedAt: new Date(), termsVersion: '1',
  });
}

function socioRow(overrides: Record<string, unknown>) {
  return {
    kind: 'member', displayName: 'X', uid: null, personId: null, responsibleUid: null, adminTitle: null,
    altaAt: new Date('2025-01-01'), bajaAt: null, createdBy: 'x', ...overrides,
  };
}

async function socios() {
  const snap = await admin.firestore().collection(`organizations/${ORG_ID}/socios`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string });
}

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncOrgSocioRoster', () => {
  it('gives a joining member a socio row with alta on the join date', async () => {
    await seedOrg();
    await seedUser('user-1', 'person-1');
    await fire(null, member());

    const rows = await socios();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'member', uid: 'user-1', personId: 'person-1', displayName: 'Ana García', bajaAt: null });
    expect((rows[0].altaAt as admin.firestore.Timestamp).toDate()).toEqual(JOINED);
  });

  it('is idempotent: a retry does not add a second row', async () => {
    await seedOrg();
    await seedUser('user-1', null);
    await fire(null, member());
    await fire(null, member());
    expect(await socios()).toHaveLength(1);
  });

  it('a persona a cargo who joins with their own account takes over the persona row and its alta', async () => {
    await seedOrg();
    await seedUser('user-1', 'person-1');
    await admin.firestore().doc(`organizations/${ORG_ID}/socios/p1`).set(
      socioRow({ kind: 'persona', personId: 'person-1', responsibleUid: 'parent' }),
    );
    await fire(null, member());

    const rows = await socios();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'p1', kind: 'member', uid: 'user-1', responsibleUid: null });
    expect((rows[0].altaAt as admin.firestore.Timestamp).toDate()).toEqual(new Date('2025-01-01'));
  });

  it('leaving gives the baja to the member and the personas they answer for, keeping the rows', async () => {
    await seedOrg();
    const db = admin.firestore();
    await db.doc(`organizations/${ORG_ID}/socios/m1`).set(socioRow({ uid: 'user-1' }));
    await db.doc(`organizations/${ORG_ID}/socios/p1`).set(socioRow({ kind: 'persona', personId: 'kid', responsibleUid: 'user-1' }));
    await db.doc(`organizations/${ORG_ID}/socios/other`).set(socioRow({ uid: 'user-2' }));
    await fire(member(), null);

    const byId = new Map((await socios()).map((r) => [r.id, r]));
    expect(byId.size).toBe(3);
    expect(byId.get('m1')?.bajaAt).not.toBeNull();
    expect(byId.get('p1')?.bajaAt).not.toBeNull();
    expect(byId.get('other')?.bajaAt).toBeNull();
  });

  it('rejoining after a baja opens a new row; the old one stays in the libro', async () => {
    await seedOrg();
    await seedUser('user-1', null);
    await admin.firestore().doc(`organizations/${ORG_ID}/socios/old`).set(socioRow({ uid: 'user-1', bajaAt: new Date('2025-06-01') }));
    await fire(null, member());
    const rows = await socios();
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.bajaAt === null)).toHaveLength(1);
  });

  it('a demoted admin loses their title', async () => {
    await seedOrg();
    await admin.firestore().doc(`organizations/${ORG_ID}/socios/m1`).set(socioRow({ uid: 'user-1', adminTitle: 'tesorero' }));
    await fire(member({ role: 'admin' }), member({ role: 'member' }));
    expect((await socios())[0].adminTitle).toBeNull();
  });

  it('the ayuntamiento keeps no roster', async () => {
    await seedOrg('ayuntamiento');
    await seedUser('user-1', null);
    await fire(null, member());
    expect(await socios()).toHaveLength(0);
  });

  it('does nothing under an org that is already gone', async () => {
    await fire(member(), null, 'user-1', 'gone');
    const snap = await admin.firestore().collection('organizations/gone/socios').get();
    expect(snap.empty).toBe(true);
  });
});
