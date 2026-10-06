// Trigger test for syncPersonDenormalization. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore
// emulator (admin SDK env is wired up in setup/admin.setup.ts).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { syncPersonDenormalization } from '../../users/syncPersonDenormalization';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncPersonDenormalization);

const USER_ID = 'user-1';
const PERSON_ID = 'person-1';

interface PersonShape {
  userId: string | null;
  givenName: string;
  middleNames: string[];
  firstSurname: string;
  secondSurname: string;
  sex?: 'male' | 'female' | 'other' | null;
}

function person(overrides: Partial<PersonShape> = {}): PersonShape {
  return {
    userId: USER_ID,
    givenName: 'Ana',
    middleNames: [],
    firstSurname: 'García',
    secondSurname: 'López',
    ...overrides,
  };
}

async function seedUser(displayName: string | null): Promise<void> {
  await admin.firestore().doc(`users/${USER_ID}`).set({
    email: 'ana@test',
    telephone: null,
    activeMunicipalityId: null,
    personId: null,
    ...(displayName !== null ? { displayName } : {}),
  });
}

function asRecord(person: PersonShape | null): Record<string, unknown> {
  return person ? (person as unknown as Record<string, unknown>) : {};
}

async function fireTrigger(
  before: PersonShape | null,
  after: PersonShape | null,
  personId = PERSON_ID,
): Promise<void> {
  const beforeSnap = ft.firestore.makeDocumentSnapshot(asRecord(before), `persons/${personId}`);
  const afterSnap = ft.firestore.makeDocumentSnapshot(asRecord(after), `persons/${personId}`);
  const change = ft.makeChange(beforeSnap, afterSnap);
  // v2 wrapper takes a single CloudEvent-style object with data + params.
  await wrapped({ data: change, params: { personId } } as unknown as Parameters<typeof wrapped>[0]);
}

beforeAll(async () => {
  await resetEmulators();
});

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('syncPersonDenormalization', () => {
  it('propagates the projected display name to users/{userId} on person create', async () => {
    await seedUser(null);
    await fireTrigger(null, person());

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    expect(userDoc.get('displayName')).toBe('Ana García López');
  });

  it('updates the existing display name on person update', async () => {
    await seedUser('Ana García López');
    await fireTrigger(person(), person({ secondSurname: 'Pérez' }));

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    expect(userDoc.get('displayName')).toBe('Ana García Pérez');
  });

  it('includes middleNames in the projection', async () => {
    await seedUser(null);
    await fireTrigger(null, person({ middleNames: ['María', 'Luisa'] }));

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    expect(userDoc.get('displayName')).toBe('Ana María Luisa García López');
  });

  it('creates the user doc with set(merge) when it does not exist yet', async () => {
    // Onboarding flow writes the person first; the user doc isn't created
    // until the following call. The trigger should still propagate cleanly.
    await fireTrigger(null, person());

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    expect(userDoc.exists).toBe(true);
    expect(userDoc.get('displayName')).toBe('Ana García López');
    // Only displayName is set; other fields filled by the subsequent client write.
    expect(userDoc.get('email')).toBeUndefined();
  });

  it('skips the user write when the projected name is unchanged', async () => {
    await seedUser('Ana García López');
    // Mutate a non-name field — projection unchanged.
    await fireTrigger(
      person(),
      person(), // identical
    );

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    expect(userDoc.get('displayName')).toBe('Ana García López');
  });

  it('does nothing when the person carries no userId link', async () => {
    await seedUser('Ana García López');
    await fireTrigger(null, person({ userId: null }));

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    // Unchanged.
    expect(userDoc.get('displayName')).toBe('Ana García López');
  });

  it('leaves displayName intact on person delete', async () => {
    await seedUser('Ana García López');
    await fireTrigger(person(), null);

    const userDoc = await admin.firestore().doc(`users/${USER_ID}`).get();
    expect(userDoc.get('displayName')).toBe('Ana García López');
  });

  describe('Embajador title (community.organizerSex)', () => {
    async function seedVillage(id: string, organizerId: string | null, organizerSex: string | null) {
      await admin.firestore().doc(`municipalities/${id}`).set({
        name: id,
        community: { organizerId, organizerSex, description: '', profileForm: null, fiestas: [], activatedAt: new Date() },
      });
    }
    async function organizerSex(id: string): Promise<unknown> {
      const snap = await admin.firestore().doc(`municipalities/${id}`).get();
      return snap.get('community.organizerSex');
    }

    it('propagates a sex change to every pueblo where the user is Embajador', async () => {
      await seedUser('Ana García López');
      await seedVillage('m1', USER_ID, 'male');
      await seedVillage('m2', USER_ID, null);
      await seedVillage('m3', 'someone-else', 'male');

      await fireTrigger(person({ sex: 'male' }), person({ sex: 'female' }));

      expect(await organizerSex('m1')).toBe('female');
      expect(await organizerSex('m2')).toBe('female');
      expect(await organizerSex('m3')).toBe('male');
    });

    it('does not touch pueblos when sex is unchanged', async () => {
      await seedUser('Ana García López');
      await seedVillage('m1', USER_ID, 'male');

      await fireTrigger(person({ sex: 'female' }), person({ sex: 'female', secondSurname: 'Pérez' }));

      // Stale value left alone: no sex change means no fan-out.
      expect(await organizerSex('m1')).toBe('male');
    });
  });
});
