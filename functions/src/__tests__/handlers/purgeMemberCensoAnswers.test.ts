// Trigger test: a villager's private census answers are deleted with their
// membership, and nobody else's are touched.

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { purgeMemberCensoAnswers } from '../../village/purgeMemberCensoAnswers';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(purgeMemberCensoAnswers);

const MID = 'm1';

async function seedAnswers(userId: string): Promise<void> {
  await admin.firestore().doc(`censoAnswers/${MID}_${userId}`).set({
    municipalityId: MID,
    userId,
    profileAnswers: { hijos: true },
    updatedAt: new Date(),
  });
}

async function fireDelete(userId: string): Promise<void> {
  const snap = ft.firestore.makeDocumentSnapshot(
    { userId, role: 'user' },
    `municipalities/${MID}/members/${userId}`,
  );
  await wrapped({ data: snap, params: { municipalityId: MID, userId } } as unknown as Parameters<
    typeof wrapped
  >[0]);
}

beforeEach(async () => {
  await resetEmulators();
});

afterAll(() => {
  ft.cleanup();
});

describe('purgeMemberCensoAnswers', () => {
  it("deletes the leaving villager's answers and only theirs", async () => {
    await seedAnswers('alice');
    await seedAnswers('bob');

    await fireDelete('alice');

    expect((await admin.firestore().doc(`censoAnswers/${MID}_alice`).get()).exists).toBe(false);
    expect((await admin.firestore().doc(`censoAnswers/${MID}_bob`).get()).exists).toBe(true);
  });

  it('is a no-op when the villager never answered', async () => {
    await expect(fireDelete('carol')).resolves.toBeUndefined();
  });
});
