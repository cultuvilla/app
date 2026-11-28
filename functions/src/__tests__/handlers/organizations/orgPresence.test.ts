// A group present in pueblos besides its own (docs/decisions/multi-village-groups.md):
// the callable the asked pueblo's Equipo answers with, the one either side
// leaves with, and the trigger that tells the Equipo a group asked.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { wrapCallable } from '../../helpers/functionsTest';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { respondToOrgPresenceRequest } from '../../../organizations/respondToOrgPresenceRequest';
import { removeOrgPresence } from '../../../organizations/removeOrgPresence';
import { onOrgPresenceRequestCreated } from '../../../organizations/onOrgPresenceRequestCreated';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const ORG_ID = 'org-1';
const HOME = 'home';
const OTHER = 'other';
const ORG_ADMIN = 'founder';
const MEMBER = 'socio';
const HOME_ADMIN = 'homeAdmin';
const OTHER_ADMIN = 'otherAdmin';
const APP_ADMIN = 'sadmin';

const db = () => admin.firestore();

async function seed(type = 'asociación'): Promise<void> {
  await db().doc(`organizations/${ORG_ID}`).set({
    name: 'Asociación Comarcal',
    description: null,
    images: [],
    type,
    status: 'approved',
    municipalityId: HOME,
    municipalityIds: [HOME],
    villageSlug: 'home',
    requestedBy: ORG_ADMIN,
    reviewedBy: 'someone',
    createdAt: new Date(),
    reviewedAt: new Date(),
    commentCount: 0,
    readCount: 0,
    memberCount: 2,
    membersPublic: true,
    joinPolicy: 'approval',
  });
  await db().doc(`organizations/${ORG_ID}/members/${ORG_ADMIN}`).set({ userId: ORG_ADMIN, joinedAt: new Date(), role: 'admin' });
  await db().doc(`organizations/${ORG_ID}/members/${MEMBER}`).set({ userId: MEMBER, joinedAt: new Date(), role: 'member' });
  await db().doc(`municipalities/${OTHER}`).set({ name: 'Pereña', slug: 'perena', communityActive: true });
  for (const [mid, uid] of [[HOME, HOME_ADMIN], [OTHER, OTHER_ADMIN]]) {
    await db().doc(`municipalities/${mid}/members/${uid}`).set({
      userId: uid, role: 'admin', joinedAt: new Date(), profileAnswers: {}, profileCompletedAt: null,
    });
  }
  await db().doc(`admins/${APP_ADMIN}`).set({ grantedAt: new Date() });
  await db().doc(`organizations/${ORG_ID}/presenceRequests/${OTHER}`).set({
    orgId: ORG_ID, municipalityId: OTHER, homeMunicipalityId: HOME, orgName: 'Asociación Comarcal', requestedBy: ORG_ADMIN, createdAt: new Date(),
  });
}

const respond = (uid: string, data: unknown): Promise<unknown> =>
  Promise.resolve(wrapCallable(ft, respondToOrgPresenceRequest)({ data, auth: { uid, token: {} } }));
const remove = (uid: string, data: unknown): Promise<unknown> =>
  Promise.resolve(wrapCallable(ft, removeOrgPresence)({ data, auth: { uid, token: {} } }));

const villagesOf = async () => (await db().doc(`organizations/${ORG_ID}`).get()).get('municipalityIds') as string[];
const requestExists = async () => (await db().doc(`organizations/${ORG_ID}/presenceRequests/${OTHER}`).get()).exists;
const notificationsOf = async (uid: string) =>
  (await db().collection(`users/${uid}/notifications`).get()).docs.map((d) => d.data());

beforeEach(async () => {
  await resetEmulators();
  await seed();
});

afterAll(() => {
  ft.cleanup();
});

describe('respondToOrgPresenceRequest', () => {
  it("the asked pueblo's Equipo accepts: listed there, request gone, the group's admins told", async () => {
    await respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'approved' });

    expect(await villagesOf()).toEqual([HOME, OTHER]);
    expect(await requestExists()).toBe(false);
    expect(await notificationsOf(ORG_ADMIN)).toEqual([
      expect.objectContaining({ type: 'org_approved', entityKind: 'organization', entityId: ORG_ID, municipalityId: OTHER }),
    ]);
    expect(await notificationsOf(MEMBER)).toEqual([]);
  });

  it('turning it away lists nothing, and still tells the admins', async () => {
    await respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'rejected' });

    expect(await villagesOf()).toEqual([HOME]);
    expect(await requestExists()).toBe(false);
    expect(await notificationsOf(ORG_ADMIN)).toEqual([expect.objectContaining({ type: 'org_rejected' })]);
  });

  it('an app admin may answer it', async () => {
    await respond(APP_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'approved' });
    expect(await villagesOf()).toEqual([HOME, OTHER]);
  });

  it.each([
    ['the group’s own admin', ORG_ADMIN],
    ['the home pueblo’s Equipo', HOME_ADMIN],
    ['an integrante', MEMBER],
  ])('%s may not answer it', async (_who, uid) => {
    await expect(respond(uid, { orgId: ORG_ID, municipalityId: OTHER, decision: 'approved' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(await villagesOf()).toEqual([HOME]);
    expect(await requestExists()).toBe(true);
  });

  it('a withdrawn request is not-found', async () => {
    await db().doc(`organizations/${ORG_ID}/presenceRequests/${OTHER}`).delete();
    await expect(respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'approved' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('will not list a group that has become a comisión, but may still turn it away', async () => {
    await db().doc(`organizations/${ORG_ID}`).update({ type: 'comisión' });
    await expect(respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'approved' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    await respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'rejected' });
    expect(await requestExists()).toBe(false);
  });

  it('will not list a group in a pueblo that is no longer active', async () => {
    await db().doc(`municipalities/${OTHER}`).update({ communityActive: false });
    await expect(respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'approved' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(await villagesOf()).toEqual([HOME]);
  });

  it('rejects a malformed decision', async () => {
    await expect(respond(OTHER_ADMIN, { orgId: ORG_ID, municipalityId: OTHER, decision: 'maybe' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('removeOrgPresence', () => {
  beforeEach(async () => {
    await db().doc(`organizations/${ORG_ID}`).update({ municipalityIds: [HOME, OTHER] });
  });

  it.each([
    ['the group’s admin', ORG_ADMIN],
    ['that pueblo’s Equipo', OTHER_ADMIN],
    ['an app admin', APP_ADMIN],
  ])('%s takes the group out of a pueblo', async (_who, uid) => {
    await remove(uid, { orgId: ORG_ID, municipalityId: OTHER });
    expect(await villagesOf()).toEqual([HOME]);
  });

  it.each([
    ['an integrante', MEMBER],
    ['the home pueblo’s Equipo', HOME_ADMIN],
  ])('%s may not', async (_who, uid) => {
    await expect(remove(uid, { orgId: ORG_ID, municipalityId: OTHER })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(await villagesOf()).toEqual([HOME, OTHER]);
  });

  it('never takes a group out of its home', async () => {
    await expect(remove(ORG_ADMIN, { orgId: ORG_ID, municipalityId: HOME })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(await villagesOf()).toEqual([HOME, OTHER]);
  });
});

describe('onOrgPresenceRequestCreated', () => {
  it("tells the asked pueblo's Equipo, and nobody else", async () => {
    const wrapped = ft.wrap(onOrgPresenceRequestCreated);
    const snap = ft.firestore.makeDocumentSnapshot(
      { orgId: ORG_ID, municipalityId: OTHER, homeMunicipalityId: HOME, orgName: 'Asociación Comarcal', requestedBy: ORG_ADMIN, createdAt: new Date() },
      `organizations/${ORG_ID}/presenceRequests/${OTHER}`,
    );
    await wrapped({ data: snap, params: { orgId: ORG_ID, municipalityId: OTHER } });

    const toEquipo = await notificationsOf(OTHER_ADMIN);
    expect(toEquipo).toEqual([
      expect.objectContaining({
        type: 'org_join_request_created',
        requesterUid: ORG_ADMIN,
        entityKind: 'organization',
        entityId: ORG_ID,
        municipalityId: OTHER,
      }),
    ]);
    expect(toEquipo[0]?.title).toContain('Pereña');
    expect(await notificationsOf(HOME_ADMIN)).toEqual([]);
  });
});
