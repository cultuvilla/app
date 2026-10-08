// Storage Rules e2e test for /municipalities/{municipalityId}/images/{imageId}.
//
// Regression: village admins upload community cover images via
// `uploadMunicipalityImage`, which writes to
// `municipalities/{id}/images/{id}`. storage.rules had no match for that
// path, so the default-deny rejected every upload with a Storage permission
// error (see apps/mobile/app/village/[villageId]/admin/community.tsx).
//
// Uses @firebase/rules-unit-testing to mount the live storage.rules file
// against the storage emulator and execute uploads under different auth
// contexts. The returned storage() instance works with the v9 modular API.
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, uploadBytes, deleteObject, type FirebaseStorage } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let env: RulesTestEnvironment;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // "‰PNG" magic bytes

beforeAll(async () => {
  const rules = readFileSync(resolve(__dirname, '../../../../storage.rules'), 'utf8');
  env = await initializeTestEnvironment({
    projectId: process.env.TEST_PROJECT_ID || 'cultuvilla-rules-test',
    // Host and port come from FIREBASE_STORAGE_EMULATOR_HOST,
    // which the harness sets to the worktree's slot when it has one.
    storage: { rules },
  });
});

beforeEach(async () => {
  await env.clearStorage();
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules — /municipalities/{municipalityId}/images/{imageId}', () => {
  it('an authenticated user can upload a community image', async () => {
    const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
    await assertSucceeds(
      uploadBytes(ref(alice, 'municipalities/m1/images/cover.png'), PNG, {
        contentType: 'image/png',
      }),
    );
  });

  it('an unauthenticated user cannot upload a community image', async () => {
    const anon = env.unauthenticatedContext().storage() as unknown as FirebaseStorage;
    await assertFails(
      uploadBytes(ref(anon, 'municipalities/m1/images/cover.png'), PNG, {
        contentType: 'image/png',
      }),
    );
  });

  it('a non-image upload is rejected', async () => {
    const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
    await assertFails(
      uploadBytes(ref(alice, 'municipalities/m1/images/notes.txt'), PNG, {
        contentType: 'text/plain',
      }),
    );
  });
});

describe('storage.rules — org / place / barrio images', () => {
  const paths = {
    organization: 'organizations/o1/image/cover.png',
    place: 'municipalities/m1/places/p1/image/cover.png',
    barrio: 'municipalities/m1/barrios/b1/image/cover.png',
  };

  for (const [label, path] of Object.entries(paths)) {
    it(`an authenticated user can upload a ${label} image`, async () => {
      const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
      await assertSucceeds(uploadBytes(ref(alice, path), PNG, { contentType: 'image/png' }));
    });

    it(`an unauthenticated user cannot upload a ${label} image`, async () => {
      const anon = env.unauthenticatedContext().storage() as unknown as FirebaseStorage;
      await assertFails(uploadBytes(ref(anon, path), PNG, { contentType: 'image/png' }));
    });

    it(`a non-image ${label} upload is rejected`, async () => {
      const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
      await assertFails(
        uploadBytes(ref(alice, path.replace('cover.png', 'notes.txt')), PNG, {
          contentType: 'text/plain',
        }),
      );
    });
  }
});

describe('storage.rules — /news/{postId}/images/{imageId}', () => {
  // The news doc is created milliseconds before its images upload, so a
  // cross-service firestore.get in the storage rule races the just-committed
  // write and denies with a 403. Mirror the event/org/place image rules: gate
  // on auth + size + content-type only (path keyed by post id); the authoring
  // guard lives on the news doc write in firestore.rules. No doc seed needed.
  it('an authenticated user can upload a news image', async () => {
    const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
    await assertSucceeds(
      uploadBytes(ref(alice, 'news/n1/images/pic.png'), PNG, { contentType: 'image/png' }),
    );
  });

  it('an unauthenticated user cannot upload a news image', async () => {
    const anon = env.unauthenticatedContext().storage() as unknown as FirebaseStorage;
    await assertFails(
      uploadBytes(ref(anon, 'news/n1/images/pic.png'), PNG, { contentType: 'image/png' }),
    );
  });

  it('a non-image news upload is rejected', async () => {
    const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
    await assertFails(
      uploadBytes(ref(alice, 'news/n1/images/notes.txt'), PNG, { contentType: 'text/plain' }),
    );
  });

  it('an authenticated user can delete a news image', async () => {
    const alice = env.authenticatedContext('alice').storage() as unknown as FirebaseStorage;
    await uploadBytes(ref(alice, 'news/n1/images/pic.png'), PNG, { contentType: 'image/png' });
    await assertSucceeds(deleteObject(ref(alice, 'news/n1/images/pic.png')));
  });
});
