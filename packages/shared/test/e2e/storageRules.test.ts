// Storage Rules e2e test. Every client-writable image path is gated on the
// same authority as the Firestore doc it illustrates (village membership, org
// or village admin, news author), read cross-service via `firestore.get`.
//
// Uses @firebase/rules-unit-testing to mount the live storage.rules and
// firestore.rules against the storage + firestore emulators.
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  ref,
  uploadBytes,
  deleteObject,
  getMetadata,
  type FirebaseStorage,
} from 'firebase/storage';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let env: RulesTestEnvironment;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // "‰PNG" magic bytes
const IMAGE = { contentType: 'image/png' };

const ACTIVE = 'm1';
const DORMANT = 'm2';
const VILLAGER = 'villager';
const VADMIN = 'vadmin';
const OUTSIDER = 'outsider';
const ORG_ADMIN = 'orgadmin';
const APP_ADMIN = 'sadmin';

beforeAll(async () => {
  const rules = readFileSync(resolve(__dirname, '../../../../storage.rules'), 'utf8');
  const firestoreRules = readFileSync(resolve(__dirname, '../../../../firestore.rules'), 'utf8');
  env = await initializeTestEnvironment({
    projectId: process.env.TEST_PROJECT_ID || 'cultuvilla-rules-test',
    // Host and port come from FIREBASE_STORAGE_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST,
    // which the harness sets to the worktree's slot when it has one.
    storage: { rules },
    firestore: { rules: firestoreRules },
  });
});

beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(doc(db, `municipalities/${ACTIVE}`), { communityActive: true });
    await setDoc(doc(db, `municipalities/${DORMANT}`), { communityActive: false });
    await setDoc(doc(db, `municipalities/${ACTIVE}/members/${VILLAGER}`), { role: 'user' });
    await setDoc(doc(db, `municipalities/${ACTIVE}/members/${VADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `admins/${APP_ADMIN}`), { createdAt: new Date() });
    await setDoc(doc(db, 'organizations/o1'), { municipalityId: ACTIVE });
    await setDoc(doc(db, `organizations/o1/members/${ORG_ADMIN}`), { role: 'admin' });
    await setDoc(doc(db, `organizations/o1/members/${VILLAGER}`), { role: 'member' });
    await setDoc(doc(db, 'news/n1'), {
      municipalityId: ACTIVE,
      createdBy: VILLAGER,
      organizerUserIds: [VILLAGER],
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).storage() as unknown as FirebaseStorage;
const anon = () => env.unauthenticatedContext().storage() as unknown as FirebaseStorage;
const upload = (storage: FirebaseStorage, path: string) => uploadBytes(ref(storage, path), PNG, IMAGE);

describe('storage.rules — village-scoped images need membership of that village', () => {
  const paths = {
    'community cover': `municipalities/${ACTIVE}/images/cover.png`,
    event: `municipalities/${ACTIVE}/events/e1/image/cover.png`,
    place: `municipalities/${ACTIVE}/places/p1/image/cover.png`,
    barrio: `municipalities/${ACTIVE}/barrios/b1/image/cover.png`,
    'festival poster': `festivalPosters/${ACTIVE}/f1/poster.png`,
    'history entry': `historyEntries/${ACTIVE}/h1/photo.png`,
  };

  for (const [label, path] of Object.entries(paths)) {
    it(`a villager can upload a ${label} image`, async () => {
      await assertSucceeds(upload(as(VILLAGER), path));
    });

    it(`an app admin can upload a ${label} image`, async () => {
      await assertSucceeds(upload(as(APP_ADMIN), path));
    });

    it(`a signed-in outsider cannot upload a ${label} image`, async () => {
      await assertFails(upload(as(OUTSIDER), path));
    });

    it(`a signed-out visitor cannot upload a ${label} image`, async () => {
      await assertFails(upload(anon(), path));
    });

    it(`a non-image ${label} upload is rejected`, async () => {
      await assertFails(
        uploadBytes(ref(as(VILLAGER), path.replace('.png', '.txt')), PNG, {
          contentType: 'text/plain',
        }),
      );
    });

    it(`anyone can read a ${label} image`, async () => {
      await upload(as(VILLAGER), path);
      await assertSucceeds(getMetadata(ref(anon(), path)));
    });
  }

  // "Empezar un pueblo" uploads the escudo before startVillage seats the
  // requester, so a dormant village accepts a signed-in upload.
  it('any signed-in user can upload a cover for a village not yet activated', async () => {
    await assertSucceeds(upload(as(OUTSIDER), `municipalities/${DORMANT}/images/escudo.png`));
  });
});

describe('storage.rules — organization images follow the org edit authority', () => {
  const path = 'organizations/o1/image/cover.png';

  it('an org admin can upload', async () => {
    await assertSucceeds(upload(as(ORG_ADMIN), path));
  });

  it("an admin of the org's village can upload", async () => {
    await assertSucceeds(upload(as(VADMIN), path));
  });

  it('an app admin can upload', async () => {
    await assertSucceeds(upload(as(APP_ADMIN), path));
  });

  it('a plain org member cannot upload', async () => {
    await assertFails(upload(as(VILLAGER), path));
  });

  it('an outsider cannot upload', async () => {
    await assertFails(upload(as(OUTSIDER), path));
  });
});

describe('storage.rules — news images follow the news edit authority', () => {
  const path = 'news/n1/images/pic.png';

  it('the author can upload and delete', async () => {
    await assertSucceeds(upload(as(VILLAGER), path));
    await assertSucceeds(deleteObject(ref(as(VILLAGER), path)));
  });

  it("an admin of the article's village can upload", async () => {
    await assertSucceeds(upload(as(VADMIN), path));
  });

  it('an outsider can neither upload nor delete', async () => {
    await assertFails(upload(as(OUTSIDER), path));
    await upload(as(VILLAGER), path);
    await assertFails(deleteObject(ref(as(OUTSIDER), path)));
  });

  it('nobody can upload for an article that does not exist', async () => {
    await assertFails(upload(as(VILLAGER), 'news/missing/images/pic.png'));
  });

  it('anyone can read a news image', async () => {
    await upload(as(VILLAGER), path);
    await assertSucceeds(getMetadata(ref(anon(), path)));
  });
});

describe('storage.rules — /persons/{personId}/photos/{imageId}', () => {
  async function seedPerson(
    personId: string,
    fields: { createdBy: string; userId: string | null; isPublic: boolean },
  ) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(db, `persons/${personId}`), fields);
    });
  }

  async function seedPhoto(path: string) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage() as unknown as FirebaseStorage, path), PNG, IMAGE);
    });
  }

  // A self-person created by a seed/migration has `createdBy` = the seed and
  // `userId` = the real owner; the owner must still manage their photo.
  it('the linked account owner can upload and delete their own person photo', async () => {
    await seedPerson('p-self', { createdBy: 'seed', userId: 'alice', isPublic: true });
    await assertSucceeds(upload(as('alice'), 'persons/p-self/photos/photo.png'));
    await assertSucceeds(deleteObject(ref(as('alice'), 'persons/p-self/photos/photo.png')));
  });

  it('the creator can upload when no account is linked', async () => {
    await seedPerson('p-own', { createdBy: 'alice', userId: null, isPublic: false });
    await assertSucceeds(upload(as('alice'), 'persons/p-own/photos/photo.png'));
  });

  it('a user who is neither owner nor creator cannot upload', async () => {
    await seedPerson('p-self', { createdBy: 'seed', userId: 'alice', isPublic: true });
    await assertFails(upload(as('bob'), 'persons/p-self/photos/photo.png'));
  });

  it("a public persona's photo is readable by any signed-in user", async () => {
    await seedPerson('p-pub', { createdBy: 'alice', userId: null, isPublic: true });
    await seedPhoto('persons/p-pub/photos/photo.png');
    await assertSucceeds(getMetadata(ref(as('bob'), 'persons/p-pub/photos/photo.png')));
  });

  it("a private persona's photo is readable only by whoever manages it", async () => {
    await seedPerson('p-priv', { createdBy: 'alice', userId: null, isPublic: false });
    await seedPhoto('persons/p-priv/photos/photo.png');
    await assertFails(getMetadata(ref(as('bob'), 'persons/p-priv/photos/photo.png')));
    await assertSucceeds(getMetadata(ref(as('alice'), 'persons/p-priv/photos/photo.png')));
  });
});
