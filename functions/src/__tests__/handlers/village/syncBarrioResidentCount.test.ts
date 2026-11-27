// Trigger tests for syncBarrioResidentCount. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore emulator.
// Modeled on functions/src/__tests__/handlers/interaction/syncEntityInteractionCounts.test.ts.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncBarrioResidentCount } from '../../../village/syncBarrioResidentCount';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncBarrioResidentCount);

const MUNICIPALITY_ID = 'm1';

interface Link {
  municipalityId: string;
  barrioId: string | null;
}

interface PartialDate { year: number | null; month: number | null; day: number | null }
interface BurialPlace { municipalityId: string; placeId: string }
interface PersonDoc {
  municipalityLinks: Link[];
  deathDate?: PartialDate | null;
  burialPlace?: BurialPlace | null;
}

function person(links: Link[], death: Pick<PersonDoc, 'deathDate' | 'burialPlace'> = {}): PersonDoc {
  return { municipalityLinks: links, ...death };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value ? (value as Record<string, unknown>) : {};
}

async function firePersonTrigger(
  before: PersonDoc | null,
  after: PersonDoc | null,
  personId = 'person-1',
): Promise<void> {
  const path = `persons/${personId}`;
  const beforeSnap = ft.firestore.makeDocumentSnapshot(asRecord(before), path);
  const afterSnap = ft.firestore.makeDocumentSnapshot(asRecord(after), path);
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrapped({ data: change, params: { personId } });
}

async function seedBarrio(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/barrios/${id}`)
    .set({ residentCount: 0, ...extra });
}

function link(barrioId: string | null): Link {
  return { municipalityId: MUNICIPALITY_ID, barrioId };
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

async function residentCount(barrioId: string): Promise<number> {
  const snap = await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/barrios/${barrioId}`)
    .get();
  return snap.get('residentCount') as number;
}

describe('syncBarrioResidentCount', () => {
  it('increments the barrio when a person gains a residence link', async () => {
    await seedBarrio('b1');
    await firePersonTrigger(person([]), person([link('b1')]));

    expect(await residentCount('b1')).toBe(1);
  });

  it('decrements the barrio when a person loses a residence link', async () => {
    await seedBarrio('b1', { residentCount: 2 });
    await firePersonTrigger(person([link('b1')]), person([]));

    expect(await residentCount('b1')).toBe(1);
  });

  it('moves the count from one barrio to another on a switch', async () => {
    await seedBarrio('b1', { residentCount: 3 });
    await seedBarrio('b2', { residentCount: 0 });
    await firePersonTrigger(person([link('b1')]), person([link('b2')]));

    expect(await residentCount('b1')).toBe(2);
    expect(await residentCount('b2')).toBe(1);
  });

  it('ignores whole-village links (barrioId null)', async () => {
    await seedBarrio('b1');
    await firePersonTrigger(person([]), person([link(null)]));

    expect(await residentCount('b1')).toBe(0);
  });

  it('no-ops when the barrio set is unchanged', async () => {
    await seedBarrio('b1', { residentCount: 4 });
    // A non-barrio field changed elsewhere; links identical → no write.
    await firePersonTrigger(person([link('b1')]), person([link('b1')]));

    expect(await residentCount('b1')).toBe(4);
  });

  it('swallows NOT_FOUND when the barrio was already deleted', async () => {
    await expect(
      firePersonTrigger(person([]), person([link('missing')])),
    ).resolves.not.toThrow();
  });

  it('does not count a persona who is created already deceased (death date)', async () => {
    await seedBarrio('b1');
    await firePersonTrigger(
      person([]),
      person([link('b1')], { deathDate: { year: 2020, month: null, day: null } }),
    );

    expect(await residentCount('b1')).toBe(0);
  });

  it('does not count a persona buried in a cemetery (no death date)', async () => {
    await seedBarrio('b1');
    await firePersonTrigger(
      person([]),
      person([link('b1')], { burialPlace: { municipalityId: MUNICIPALITY_ID, placeId: 'cem1' } }),
    );

    expect(await residentCount('b1')).toBe(0);
  });

  it('decrements the barrio when a living resident becomes deceased', async () => {
    await seedBarrio('b1', { residentCount: 3 });
    await firePersonTrigger(
      person([link('b1')]),
      person([link('b1')], { deathDate: { year: 2021, month: 3, day: null } }),
    );

    expect(await residentCount('b1')).toBe(2);
  });
});
