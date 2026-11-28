// Firestore Rules e2e test for /persons/{personId}.
// Verifies: owner can create their own persona; create is rejected when
// createdBy != auth.uid; owner can update photoURL; non-owner cannot update.
//
// Uses @firebase/rules-unit-testing to mount the live firestore.rules file
// against the firestore emulator and execute requests under different auth
// contexts.
import { describe, it } from 'vitest';
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAdmin, asUser, asAnon, seed } from '../helpers/roles';

const getEnv = useRulesTestEnv();

const OWNER = 'uid-1';
const OTHER = 'uid-2';
const PERSON_ID = 'p1';

type PersonOverrides = Partial<{ createdBy: string; userId: string | null; isPublic: boolean }>;

const personData = (overrides: PersonOverrides = {}) => ({
  givenName: 'Ana',
  middleNames: [],
  firstSurname: null,
  secondSurname: null,
  nickname: null,
  sex: null,
  birthday: null,
  deathDate: null,
  birthPlace: null,
  burialPlace: null,
  municipalityLinks: [],
  occupations: [],
  biography: null,
  photoURL: null,
  userId: overrides.userId ?? null,
  isPublic: overrides.isPublic ?? true,
  createdBy: overrides.createdBy ?? OWNER,
  createdAt: serverTimestamp(),
});

async function seedPerson(overrides: PersonOverrides = {}) {
  await seed(getEnv(), async (ctx) => {
    await setDoc(doc(ctx.firestore(), `persons/${PERSON_ID}`), {
      ...personData(overrides),
      createdAt: new Date(),
    });
  });
}

describe('firestore.rules — /persons/{personId}', () => {
  describe('create', () => {
    it('owner can create their own persona', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertSucceeds(
        setDoc(doc(ownerDb, `persons/${PERSON_ID}`), personData({ createdBy: OWNER })),
      );
    });

    it('create is rejected when createdBy != auth.uid', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(doc(ownerDb, `persons/${PERSON_ID}`), personData({ createdBy: OTHER })),
      );
    });

    it('a dependent persona can be created private', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertSucceeds(
        setDoc(
          doc(ownerDb, `persons/${PERSON_ID}`),
          personData({ createdBy: OWNER, userId: null, isPublic: false }),
        ),
      );
    });

    // Privacy is a dependent-persona feature: an account holder's persona is
    // their public face in the pueblo.
    it('an account persona cannot be created private', async () => {
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(
        setDoc(
          doc(ownerDb, `persons/${PERSON_ID}`),
          personData({ createdBy: OWNER, userId: OWNER, isPublic: false }),
        ),
      );
    });
  });

  describe('read', () => {
    it('an unauthenticated user can read a public person', async () => {
      await seedPerson();
      const guestDb = asAnon(getEnv());
      await assertSucceeds(getDoc(doc(guestDb, `persons/${PERSON_ID}`)));
    });

    it('a private persona is denied to a guest', async () => {
      await seedPerson({ isPublic: false });
      const guestDb = asAnon(getEnv());
      await assertFails(getDoc(doc(guestDb, `persons/${PERSON_ID}`)));
    });

    it('a private persona is denied to another signed-in user', async () => {
      await seedPerson({ isPublic: false });
      const otherDb = asUser(getEnv(), OTHER);
      await assertFails(getDoc(doc(otherDb, `persons/${PERSON_ID}`)));
    });

    it('a private persona is readable by its creator', async () => {
      await seedPerson({ createdBy: OWNER, isPublic: false });
      const ownerDb = asUser(getEnv(), OWNER);
      await assertSucceeds(getDoc(doc(ownerDb, `persons/${PERSON_ID}`)));
    });
  });

  describe('update', () => {
    it('owner can update photoURL after create', async () => {
      await seedPerson({ createdBy: OWNER, userId: OWNER });
      const ownerDb = asUser(getEnv(), OWNER);
      await assertSucceeds(
        updateDoc(doc(ownerDb, `persons/${PERSON_ID}`), { photoURL: 'https://example.com/photo.jpg' }),
      );
    });

    it('update is rejected for a different user', async () => {
      await seedPerson({ createdBy: OWNER, userId: OWNER });
      const otherDb = asUser(getEnv(), OTHER);
      await assertFails(
        updateDoc(doc(otherDb, `persons/${PERSON_ID}`), { photoURL: 'https://example.com/photo.jpg' }),
      );
    });

    it('the creator can flip a dependent persona to private', async () => {
      await seedPerson({ createdBy: OWNER, userId: null });
      const ownerDb = asUser(getEnv(), OWNER);
      await assertSucceeds(updateDoc(doc(ownerDb, `persons/${PERSON_ID}`), { isPublic: false }));
    });

    it('an account holder cannot hide their own persona', async () => {
      await seedPerson({ createdBy: OWNER, userId: OWNER });
      const ownerDb = asUser(getEnv(), OWNER);
      await assertFails(updateDoc(doc(ownerDb, `persons/${PERSON_ID}`), { isPublic: false }));
    });
  });

  // The cemetery list is built from two queries rather than one because rules
  // are evaluated per matched document. These pin that constraint down: without
  // them, someone could "simplify" getPersonsByBurialPlace back into a single
  // query and only discover at runtime that the whole list is denied.
  describe('list', () => {
    const CEMETERY = 'cem-1';

    async function seedBuried() {
      await seed(getEnv(), async (ctx) => {
        const db = ctx.firestore();
        const burialPlace = { municipalityId: 'm1', placeId: CEMETERY };
        await setDoc(doc(db, 'persons/buried-public'), {
          ...personData({ createdBy: OTHER }),
          burialPlace,
          createdAt: new Date(),
        });
        await setDoc(doc(db, 'persons/buried-private'), {
          ...personData({ createdBy: OWNER, isPublic: false }),
          burialPlace,
          createdAt: new Date(),
        });
      });
    }

    const buriedHere = () => where('burialPlace.placeId', '==', CEMETERY);

    it('an unfiltered query is denied outright once a private persona is buried there', async () => {
      await seedBuried();
      const db = asUser(getEnv(), OWNER);
      await assertFails(getDocs(query(collection(db, 'persons'), buriedHere())));
    });

    it('a guest may list the public burials', async () => {
      await seedBuried();
      const db = asAnon(getEnv());
      await assertSucceeds(
        getDocs(query(collection(db, 'persons'), buriedHere(), where('isPublic', '==', true))),
      );
    });

    it('the creator may list their own burials, private ones included', async () => {
      await seedBuried();
      const db = asUser(getEnv(), OWNER);
      await assertSucceeds(
        getDocs(query(collection(db, 'persons'), buriedHere(), where('createdBy', '==', OWNER))),
      );
    });

    it('nobody may list burials created by someone else', async () => {
      await seedBuried();
      const db = asUser(getEnv(), OTHER);
      await assertFails(
        getDocs(query(collection(db, 'persons'), buriedHere(), where('createdBy', '==', OWNER))),
      );
    });
  });
  // The picker sheets (OrganizerPicker, inbox requesters, third-party profile)
  // resolve a villager's persona by `userId`. A member who marked their persona
  // private makes the unfiltered lookup illegal — the service must pin the
  // public branch for anyone but the person themselves.
  describe('lookup by userId', () => {
    async function seedLinkedPersons() {
      await seed(getEnv(), async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'persons/linked-private'), {
          ...personData({ createdBy: OTHER, userId: OTHER, isPublic: false }),
          createdAt: new Date(),
        });
      });
    }

    it('an unfiltered lookup of a private persona is denied', async () => {
      await seedLinkedPersons();
      const db = asUser(getEnv(), OWNER);
      await assertFails(
        getDocs(query(collection(db, 'persons'), where('userId', '==', OTHER))),
      );
    });

    it('the same lookup pinned to the public branch is allowed', async () => {
      await seedLinkedPersons();
      const db = asUser(getEnv(), OWNER);
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'persons'),
            where('userId', '==', OTHER),
            where('isPublic', '==', true),
          ),
        ),
      );
    });

    it('a user may look up their own persona unfiltered, private included', async () => {
      await seedLinkedPersons();
      const db = asUser(getEnv(), OTHER);
      await assertSucceeds(
        getDocs(query(collection(db, 'persons'), where('userId', '==', OTHER))),
      );
    });
  });

  // The read-only /user/[uid] profile loads the viewed villager's personas.
  // `createdBy ==` alone proves nothing about `isPublic` or about the caller,
  // so rules reject it outright for anyone but the creator — regardless of
  // whether that user actually has a private persona. That denial used to
  // abort the whole profile load, leaving the photo and every stat empty.
  describe('list by createdBy', () => {
    async function seedCreated() {
      await seed(getEnv(), async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, 'persons/created-account'), {
          ...personData({ createdBy: OTHER, userId: OTHER, isPublic: true }),
          createdAt: new Date(),
        });
        await setDoc(doc(db, 'persons/created-dependent'), {
          ...personData({ createdBy: OTHER, userId: null, isPublic: true }),
          createdAt: new Date(),
        });
      });
    }

    it("an unpinned query for another user's personas is denied", async () => {
      await seedCreated();
      const db = asUser(getEnv(), OWNER);
      await assertFails(
        getDocs(query(collection(db, 'persons'), where('createdBy', '==', OTHER))),
      );
    });

    it('the same query pinned to the public branch is allowed', async () => {
      await seedCreated();
      const db = asUser(getEnv(), OWNER);
      await assertSucceeds(
        getDocs(
          query(
            collection(db, 'persons'),
            where('createdBy', '==', OTHER),
            where('isPublic', '==', true),
          ),
        ),
      );
    });

    it('a user may list their own personas unpinned, private included', async () => {
      await seedCreated();
      const db = asUser(getEnv(), OTHER);
      await assertSucceeds(
        getDocs(query(collection(db, 'persons'), where('createdBy', '==', OTHER))),
      );
    });
  });
});

// A creator removes a familiar they made; a persona someone signed in as is
// theirs, so only an app admin removes it.
describe('firestore.rules — /persons/{personId} delete', () => {
  it('lets the creator delete an unlinked persona', async () => {
    await seedPerson();
    await assertSucceeds(deleteDoc(doc(asUser(getEnv(), OWNER), `persons/${PERSON_ID}`)));
  });

  it('refuses the creator once the persona is linked to an account', async () => {
    await seedPerson({ userId: OTHER });
    await assertFails(deleteDoc(doc(asUser(getEnv(), OWNER), `persons/${PERSON_ID}`)));
  });

  it('refuses anyone but the creator', async () => {
    await seedPerson();
    await assertFails(deleteDoc(doc(asUser(getEnv(), OTHER), `persons/${PERSON_ID}`)));
  });

  it('lets an app admin delete a linked persona', async () => {
    await seedPerson({ userId: OTHER });
    const admin = await asAdmin(getEnv(), 'sadmin');
    await assertSucceeds(deleteDoc(doc(admin, `persons/${PERSON_ID}`)));
  });
});
