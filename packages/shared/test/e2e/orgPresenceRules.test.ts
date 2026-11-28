// firestore.rules — a group present in pueblos besides its own
// (docs/decisions/multi-village-groups.md).
//
// A group admin asks another pueblo through organizations/{org}/presenceRequests;
// that pueblo's Equipo answers through the respondToOrgPresenceRequest callable.
// `municipalityIds` itself is function-owned: no client writes it beyond the
// home it is created with.
import { beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asAnon, asUser, seed } from '../helpers/roles';
import { buildOrganizationData } from '../../src/models/organization/OrganizationDataModel';
import { buildOrgPresenceRequestData } from '../../src/models/organization/OrgPresenceRequestDataModel';

const getEnv = useRulesTestEnv();
const HOME = 'home';
const OTHER = 'other';
const DORMANT = 'dormant';
const ORG = 'asociacion';
const AYUNTAMIENTO = 'ayto';
const ORG_ADMIN = 'oadmin';
const ORG_MEMBER = 'omember';
const OTHER_ADMIN = 'otherAdmin';
const HOME_ADMIN = 'homeAdmin';
const STRANGER = 'stranger';

const villageMember = (userId: string, role: string) => ({
  userId, role, joinedAt: new Date(), profileAnswers: {}, profileCompletedAt: null,
});
const ask = (municipalityId: string, overrides: Record<string, unknown> = {}) => ({
  ...buildOrgPresenceRequestData({
    orgId: ORG, municipalityId, homeMunicipalityId: HOME, orgName: 'Asociación Comarcal', requestedBy: ORG_ADMIN,
  }),
  ...overrides,
});

beforeEach(async () => {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    for (const [id, active] of [[HOME, true], [OTHER, true], [DORMANT, false]] as const) {
      await setDoc(doc(db, `municipalities/${id}`), { name: id, communityActive: active });
    }
    const org = (type: 'asociación' | 'ayuntamiento') =>
      buildOrganizationData({
        name: 'Asociación Comarcal', type, status: 'approved', municipalityId: HOME, villageSlug: 'home', requestedBy: ORG_ADMIN,
      });
    await setDoc(doc(db, `organizations/${ORG}`), org('asociación'));
    await setDoc(doc(db, `organizations/${AYUNTAMIENTO}`), org('ayuntamiento'));
    for (const orgId of [ORG, AYUNTAMIENTO]) {
      await setDoc(doc(db, `organizations/${orgId}/members/${ORG_ADMIN}`), { userId: ORG_ADMIN, role: 'admin', joinedAt: new Date() });
    }
    await setDoc(doc(db, `organizations/${ORG}/members/${ORG_MEMBER}`), { userId: ORG_MEMBER, role: 'member', joinedAt: new Date() });
    await setDoc(doc(db, `municipalities/${OTHER}/members/${OTHER_ADMIN}`), villageMember(OTHER_ADMIN, 'admin'));
    await setDoc(doc(db, `municipalities/${HOME}/members/${HOME_ADMIN}`), villageMember(HOME_ADMIN, 'admin'));
    await setDoc(doc(db, `municipalities/${HOME}/members/${ORG_ADMIN}`), villageMember(ORG_ADMIN, 'member'));
  });
});

describe('asking another pueblo', () => {
  it('a group admin may ask a pueblo with a community', async () => {
    await assertSucceeds(setDoc(doc(asUser(getEnv(), ORG_ADMIN), `organizations/${ORG}/presenceRequests/${OTHER}`), ask(OTHER)));
  });

  it('a plain integrante may not', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), ORG_MEMBER), `organizations/${ORG}/presenceRequests/${OTHER}`), ask(OTHER, { requestedBy: ORG_MEMBER })),
    );
  });

  it('is refused for a pueblo with nobody to answer it', async () => {
    await assertFails(setDoc(doc(asUser(getEnv(), ORG_ADMIN), `organizations/${ORG}/presenceRequests/${DORMANT}`), ask(DORMANT)));
  });

  it('is refused for its own pueblo, and for one that already lists it', async () => {
    const db = asUser(getEnv(), ORG_ADMIN);
    await assertFails(setDoc(doc(db, `organizations/${ORG}/presenceRequests/${HOME}`), ask(HOME)));
    await seed(getEnv(), (ctx) => updateDoc(doc(ctx.firestore(), `organizations/${ORG}`), { municipalityIds: [HOME, OTHER] }));
    await assertFails(setDoc(doc(db, `organizations/${ORG}/presenceRequests/${OTHER}`), ask(OTHER)));
  });

  it('is refused for an ayuntamiento', async () => {
    await assertFails(
      setDoc(doc(asUser(getEnv(), ORG_ADMIN), `organizations/${AYUNTAMIENTO}/presenceRequests/${OTHER}`), ask(OTHER, { orgId: AYUNTAMIENTO })),
    );
  });

  it('must name the group, its home and the pueblo truthfully', async () => {
    const db = asUser(getEnv(), ORG_ADMIN);
    const path = `organizations/${ORG}/presenceRequests/${OTHER}`;
    await assertFails(setDoc(doc(db, path), ask(OTHER, { orgName: 'Otro nombre' })));
    await assertFails(setDoc(doc(db, path), ask(OTHER, { homeMunicipalityId: OTHER })));
    await assertFails(setDoc(doc(db, path), ask(HOME)));
    await assertFails(setDoc(doc(db, path), ask(OTHER, { requestedBy: STRANGER })));
  });
});

describe('a pending request', () => {
  beforeEach(async () => {
    await seed(getEnv(), (ctx) => setDoc(doc(ctx.firestore(), `organizations/${ORG}/presenceRequests/${OTHER}`), ask(OTHER)));
  });

  it("is listed for the asked pueblo's Equipo, and not for another pueblo's", async () => {
    const byVillage = (db: ReturnType<typeof asUser>, mid: string) =>
      getDocs(query(collectionGroup(db, 'presenceRequests'), where('municipalityId', '==', mid)));
    await assertSucceeds(byVillage(asUser(getEnv(), OTHER_ADMIN), OTHER));
    await assertFails(byVillage(asUser(getEnv(), HOME_ADMIN), OTHER));
  });

  it('is listed for the admin who asked, and for an app admin', async () => {
    await assertSucceeds(
      getDocs(query(collectionGroup(asUser(getEnv(), ORG_ADMIN), 'presenceRequests'), where('requestedBy', '==', ORG_ADMIN))),
    );
    await assertSucceeds(getDocs(collectionGroup(await asAdmin(getEnv(), 'sadmin'), 'presenceRequests')));
    await assertFails(getDocs(collectionGroup(asUser(getEnv(), STRANGER), 'presenceRequests')));
    await assertFails(getDocs(query(collectionGroup(asAnon(getEnv()), 'presenceRequests'), where('municipalityId', '==', OTHER))));
  });

  it("is read by the group's admins", async () => {
    await assertSucceeds(getDocs(collection(asUser(getEnv(), ORG_ADMIN), `organizations/${ORG}/presenceRequests`)));
    await assertFails(getDocs(collection(asUser(getEnv(), ORG_MEMBER), `organizations/${ORG}/presenceRequests`)));
    await assertSucceeds(getDoc(doc(asUser(getEnv(), OTHER_ADMIN), `organizations/${ORG}/presenceRequests/${OTHER}`)));
    await assertFails(getDoc(doc(asUser(getEnv(), ORG_MEMBER), `organizations/${ORG}/presenceRequests/${OTHER}`)));
  });

  it('is never edited by a client', async () => {
    await assertFails(
      updateDoc(doc(asUser(getEnv(), ORG_ADMIN), `organizations/${ORG}/presenceRequests/${OTHER}`), { orgName: 'x' }),
    );
  });

  it("is withdrawn by the group's admins or turned away by the pueblo's Equipo, nobody else", async () => {
    const path = `organizations/${ORG}/presenceRequests/${OTHER}`;
    await assertFails(deleteDoc(doc(asUser(getEnv(), HOME_ADMIN), path)));
    await assertFails(deleteDoc(doc(asUser(getEnv(), ORG_MEMBER), path)));
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), OTHER_ADMIN), path)));
  });
});

describe('the pueblos a group is in are function-owned', () => {
  it("not even the group's admins or its home Equipo may add a pueblo", async () => {
    await assertFails(updateDoc(doc(asUser(getEnv(), ORG_ADMIN), `organizations/${ORG}`), { municipalityIds: [HOME, OTHER] }));
    await assertFails(updateDoc(doc(asUser(getEnv(), HOME_ADMIN), `organizations/${ORG}`), { municipalityIds: [HOME, OTHER] }));
  });

  it('a group listed elsewhere may not become a comisión, one at home may', async () => {
    const db = asUser(getEnv(), ORG_ADMIN);
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG}`), { type: 'comisión' }));
    await seed(getEnv(), (ctx) =>
      updateDoc(doc(ctx.firestore(), `organizations/${ORG}`), { type: 'asociación', municipalityIds: [HOME, OTHER] }),
    );
    await assertFails(updateDoc(doc(db, `organizations/${ORG}`), { type: 'comisión' }));
    await assertSucceeds(updateDoc(doc(db, `organizations/${ORG}`), { type: 'peña' }));
  });

  it('a new group is created listed in its home alone', async () => {
    const db = asUser(getEnv(), ORG_ADMIN);
    const group = (municipalityIds?: string[]) => ({
      ...buildOrganizationData({ name: 'Peña Nueva', type: 'peña', municipalityId: HOME, villageSlug: 'home', requestedBy: ORG_ADMIN }),
      ...(municipalityIds ? { municipalityIds } : {}),
    });
    await assertSucceeds(setDoc(doc(db, 'organizations/new1'), group()));
    await assertFails(setDoc(doc(db, 'organizations/new2'), group([HOME, OTHER])));
    // Installed binaries create it without the field.
    const { municipalityIds: _omit, ...legacy } = group();
    await assertSucceeds(setDoc(doc(db, 'organizations/new3'), legacy));
  });
});
