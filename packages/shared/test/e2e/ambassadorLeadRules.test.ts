// Firestore Rules e2e test for top-level /ambassadorLeads/{leadId} — names and
// phone numbers left on the read site's /embajadores form by people with no
// account. Only app admins may read them; nobody writes them from a client,
// because the readSite function writes through the admin SDK.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asUser, asAnon, asAdmin, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();
const LEAD = 'lead-1';

const lead = () => ({
  municipalityId: 'muni-1',
  municipalityName: 'Matabuena (Segovia)',
  name: 'Ana',
  phone: '+34612345678',
  ipHash: 'abc',
  status: 'new',
  createdAt: new Date(),
});

async function seedLead() {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, `ambassadorLeads/${LEAD}`), lead());
  });
}

describe('firestore.rules — /ambassadorLeads/{leadId}', () => {
  it('an app admin can read and list leads', async () => {
    await seedLead();
    const db = await asAdmin(getEnv(), 'sadmin');
    await assertSucceeds(getDoc(doc(db, `ambassadorLeads/${LEAD}`)));
    await assertSucceeds(getDocs(collection(db, 'ambassadorLeads')));
  });

  it('nobody else can read a lead — not a signed-in user, not an anonymous visitor', async () => {
    await seedLead();
    await assertFails(getDoc(doc(asUser(getEnv(), 'bob'), `ambassadorLeads/${LEAD}`)));
    await assertFails(getDocs(collection(asUser(getEnv(), 'bob'), 'ambassadorLeads')));
    await assertFails(getDoc(doc(asAnon(getEnv()), `ambassadorLeads/${LEAD}`)));
  });

  it('no client writes a lead, app admins included', async () => {
    await seedLead();
    const admin = await asAdmin(getEnv(), 'sadmin');
    await assertFails(addDoc(collection(asAnon(getEnv()), 'ambassadorLeads'), lead()));
    await assertFails(addDoc(collection(asUser(getEnv(), 'bob'), 'ambassadorLeads'), lead()));
    await assertFails(addDoc(collection(admin, 'ambassadorLeads'), lead()));
    await assertFails(updateDoc(doc(admin, `ambassadorLeads/${LEAD}`), { status: 'contacted' }));
    await assertFails(deleteDoc(doc(admin, `ambassadorLeads/${LEAD}`)));
  });
});
