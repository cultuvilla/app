// Firestore Rules e2e test for the /organizations/{orgId} update + delete path.
//
// Approval is function-owned: the `approveOrganization` callable flips the
// status AND seeds the founding admin + audits it via the admin SDK. So the
// rule now FORBIDS a client from setting `status: 'approved'` (for anyone,
// including app admins); clients may still reject or edit other fields:
//   allow update: if (isVillageAdmin(mid) || isAppAdmin())
//     && (request.resource.data.status == resource.data.status
//         || request.resource.data.status == 'rejected');
// where isVillageAdmin(mid) requires a `municipalities/{mid}/members/{uid}` doc
// with `role == 'admin'`, and isAppAdmin requires an `admins/{uid}` doc.
//
// Uses @firebase/rules-unit-testing to mount the live firestore.rules file
// against the firestore emulator under different auth contexts. We assert the
// RULE allows/denies each write — not the service.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed } from '../helpers/roles';
import { buildOrganizationData } from '../../src/models/organization/OrganizationDataModel';

const getEnv = useRulesTestEnv();

const ORG_ID = 'o1';
const MID = 'mun1';
const VILLAGE_ADMIN = 'vadmin';
const VILLAGE_MEMBER = 'vmember';
const OTHER_USER = 'stranger';
const APP_ADMIN = 'sadmin';
const ORG_ADMIN = 'oadmin';

// Approval is callable-only — a client attempting this patch is denied.
const approvePatch = { status: 'approved', reviewedBy: VILLAGE_ADMIN, reviewedAt: new Date() };
// Rejection stays a client write (no membership change to audit).
const rejectPatch = { status: 'rejected' };
// A non-status edit (status left unchanged) stays a client write.
const describePatch = { description: 'Actualizada' };

async function seedOrgAndMembers() {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore();
    await setDoc(
      doc(db, `organizations/${ORG_ID}`),
      buildOrganizationData({
        name: 'Peña Ejemplo',
        type: 'peña',
        status: 'pending',
        municipalityId: MID,
        villageSlug: 'villa',
        requestedBy: 'creator',
      }),
    );
    // isVillageAdmin(MID): needs a members doc with role 'admin'.
    await setDoc(doc(db, `municipalities/${MID}/members/${VILLAGE_ADMIN}`), {
      userId: VILLAGE_ADMIN,
      role: 'admin',
      joinedAt: new Date(),
      profileAnswers: {},
      profileCompletedAt: null,
    });
    // A plain (non-admin) member of the same municipality.
    await setDoc(doc(db, `municipalities/${MID}/members/${VILLAGE_MEMBER}`), {
      userId: VILLAGE_MEMBER,
      role: 'member',
      joinedAt: new Date(),
      profileAnswers: {},
      profileCompletedAt: null,
    });
    // isOrgAdmin(ORG_ID): an org member doc with role 'admin' — not a village
    // admin, mirroring a founder seeded by approveOrganization.
    await setDoc(doc(db, `organizations/${ORG_ID}/members/${ORG_ADMIN}`), {
      userId: ORG_ADMIN,
      role: 'admin',
      joinedAt: new Date(),
    });
  });
}

describe('firestore.rules — /organizations/{orgId} update + delete', () => {
  describe('approval is function-owned (callable-only)', () => {
    it('a village admin CANNOT approve client-side (status -> approved)', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), approvePatch));
    });

    it('an app admin CANNOT approve client-side either', async () => {
      await seedOrgAndMembers();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), approvePatch));
    });
  });

  describe('reject / edit stay client writes', () => {
    it('a village admin can reject (pending -> rejected)', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_ID}`), rejectPatch));
    });

    it('a village admin can edit a non-status field (status unchanged)', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_ID}`), describePatch));
    });

    it('an app admin can reject', async () => {
      await seedOrgAndMembers();
      const db = await asAdmin(getEnv(), APP_ADMIN);
      await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_ID}`), rejectPatch));
    });

    it('a plain village member (role member, not admin) cannot reject/edit', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), VILLAGE_MEMBER);
      await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), rejectPatch));
    });

    it('an unrelated authenticated user cannot reject/edit', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), OTHER_USER);
      await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), rejectPatch));
    });

    it('an org admin (not a village admin) can edit a non-status field, e.g. imageURL', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), ORG_ADMIN);
      await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_ID}`), { imageURL: 'https://example.com/new.jpg' }));
    });

    it('an anonymous user cannot update', async () => {
      await seedOrgAndMembers();
      const db = asAnon(getEnv());
      await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), rejectPatch));
    });
  });

  // The ayuntamiento is a per-village singleton only requestAyuntamiento mints,
  // so `type` may move among the self-service kinds but never to or from it.
  describe('type', () => {
    it('an org admin can move a peña to asociación, and on to otros', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), ORG_ADMIN);
      await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_ID}`), { type: 'asociación' }));
      await assertSucceeds(updateDoc(doc(db, `organizations/${ORG_ID}`), { type: 'otros' }));
    });

    it('nobody can turn a group into the ayuntamiento', async () => {
      await seedOrgAndMembers();
      for (const db of [asUser(getEnv(), ORG_ADMIN), asUser(getEnv(), VILLAGE_ADMIN), await asAdmin(getEnv(), APP_ADMIN)]) {
        await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), { type: 'ayuntamiento' }));
      }
    });

    it('nobody can turn the ayuntamiento into a group', async () => {
      await seedOrgAndMembers();
      await seed(getEnv(), async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `organizations/${ORG_ID}`), { type: 'ayuntamiento' });
      });
      for (const db of [asUser(getEnv(), ORG_ADMIN), await asAdmin(getEnv(), APP_ADMIN)]) {
        await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), { type: 'peña' }));
      }
    });

    it('rejects a type outside the enum', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), ORG_ADMIN);
      await assertFails(updateDoc(doc(db, `organizations/${ORG_ID}`), { type: 'club' }));
    });
  });

  describe('delete', () => {
    it('a village admin of the org municipality can delete', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), VILLAGE_ADMIN);
      await assertSucceeds(deleteDoc(doc(db, `organizations/${ORG_ID}`)));
    });

    it('a plain village member cannot delete', async () => {
      await seedOrgAndMembers();
      const db = asUser(getEnv(), VILLAGE_MEMBER);
      await assertFails(deleteDoc(doc(db, `organizations/${ORG_ID}`)));
    });
  });
});
