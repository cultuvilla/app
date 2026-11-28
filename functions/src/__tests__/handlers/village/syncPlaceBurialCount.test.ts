import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { syncPlaceBurialCount } from '../../../village/syncPlaceBurialCount';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncPlaceBurialCount);

const MUNICIPALITY_ID = 'm1';

interface BurialPlace {
  municipalityId: string;
  placeId: string;
}

function person(burialPlace: BurialPlace | null): { burialPlace: BurialPlace | null } {
  return { burialPlace };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value ? (value as Record<string, unknown>) : {};
}

async function firePersonTrigger(
  before: { burialPlace: BurialPlace | null } | null,
  after: { burialPlace: BurialPlace | null } | null,
  personId = 'person-1',
): Promise<void> {
  const path = `persons/${personId}`;
  const beforeSnap = ft.firestore.makeDocumentSnapshot(asRecord(before), path);
  const afterSnap = ft.firestore.makeDocumentSnapshot(asRecord(after), path);
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrapped({ data: change, params: { personId } });
}

async function seedPlace(id: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/places/${id}`)
    .set({ burialCount: 0, ...extra });
}

function place(placeId: string): BurialPlace {
  return { municipalityId: MUNICIPALITY_ID, placeId };
}

async function burialCount(placeId: string): Promise<number> {
  const snap = await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}/places/${placeId}`)
    .get();
  return snap.get('burialCount') as number;
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

describe('syncPlaceBurialCount', () => {
  it('increments the cemetery when a person gains a burial place', async () => {
    await seedPlace('p1');
    await firePersonTrigger(person(null), person(place('p1')));

    expect(await burialCount('p1')).toBe(1);
  });

  it('decrements the cemetery when a person loses a burial place', async () => {
    await seedPlace('p1', { burialCount: 2 });
    await firePersonTrigger(person(place('p1')), person(null));

    expect(await burialCount('p1')).toBe(1);
  });

  it('moves the count from one cemetery to another on a switch', async () => {
    await seedPlace('p1', { burialCount: 3 });
    await seedPlace('p2');
    await firePersonTrigger(person(place('p1')), person(place('p2')));

    expect(await burialCount('p1')).toBe(2);
    expect(await burialCount('p2')).toBe(1);
  });

  it('no-ops when the burial place is unchanged', async () => {
    await seedPlace('p1', { burialCount: 4 });
    await firePersonTrigger(person(place('p1')), person(place('p1')));

    expect(await burialCount('p1')).toBe(4);
  });

  it('swallows NOT_FOUND when the cemetery was already deleted', async () => {
    await expect(
      firePersonTrigger(person(null), person(place('missing'))),
    ).resolves.not.toThrow();
  });
});
