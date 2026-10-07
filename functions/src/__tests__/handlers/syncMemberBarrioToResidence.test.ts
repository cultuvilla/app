// Trigger test for syncMemberBarrioToResidence — now a delete-only cleanup.
// Drives the handler via firebase-functions-test's wrap() against the Firestore
// emulator. The create/upsert projection moved to the client batches and the
// server-side membership creations; this trigger only removes the residence link on membership
// delete (admin-remove path, where the actor can't write the user's person doc).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { syncMemberBarrioToResidence } from '../../village/syncMemberBarrioToResidence';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncMemberBarrioToResidence);

const MUNI = 'mun-test';
const USER = 'user-test';
const PERSON = 'person-test';

interface MemberShape {
  userId: string;
  role: string;
}

function member(overrides: Partial<MemberShape> = {}): MemberShape {
  return { userId: USER, role: 'user', ...overrides };
}

async function seedPerson(municipalityLinks: unknown[]): Promise<void> {
  await admin.firestore().doc(`persons/${PERSON}`).set({
    givenName: 'Ana',
    userId: USER,
    municipalityLinks,
    createdBy: USER,
    createdAt: new Date(),
  });
}

async function personLinks(): Promise<unknown[]> {
  const snap = await admin.firestore().doc(`persons/${PERSON}`).get();
  return (snap.get('municipalityLinks') as unknown[] | undefined) ?? [];
}

/** Fire the delete trigger for the member doc. */
async function fireDelete(before: MemberShape): Promise<void> {
  const path = `municipalities/${MUNI}/members/${USER}`;
  const beforeSnap = ft.firestore.makeDocumentSnapshot(
    before as unknown as Record<string, unknown>,
    path,
  );
  await wrapped({
    data: beforeSnap,
    params: { municipalityId: MUNI, userId: USER },
  } as unknown as Parameters<typeof wrapped>[0]);
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

describe('syncMemberBarrioToResidence (delete-only cleanup)', () => {
  it('removes the residence link when the member is deleted', async () => {
    await seedPerson([
      { municipalityId: MUNI, barrioId: 'centro' },
      { municipalityId: 'other', barrioId: null },
    ]);

    await fireDelete(member());

    // The link for this municipality is gone; links for other villages remain.
    expect(await personLinks()).toEqual([{ municipalityId: 'other', barrioId: null }]);
  });

  it('removes a whole-village (null barrio) link on delete', async () => {
    await seedPerson([{ municipalityId: MUNI, barrioId: null }]);

    await fireDelete(member());

    expect(await personLinks()).toEqual([]);
  });

  it('is a no-op when the link was already removed (self-leave idempotency)', async () => {
    // A self-leave batch already dropped the link; the delete trigger then fires.
    await seedPerson([{ municipalityId: 'other', barrioId: null }]);
    await admin.firestore().doc(`persons/${PERSON}`).update({ biography: 'sentinel' });

    await fireDelete(member());

    const snap = await admin.firestore().doc(`persons/${PERSON}`).get();
    // The sentinel survives → the handler returned early without rewriting.
    expect(snap.get('biography')).toBe('sentinel');
    expect(snap.get('municipalityLinks')).toEqual([{ municipalityId: 'other', barrioId: null }]);
  });

  it('skips when no person is linked to the user', async () => {
    // No person seeded → handler must not throw.
    await expect(fireDelete(member())).resolves.toBeUndefined();
  });
});
