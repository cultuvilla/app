// Trigger test for syncVillageDenormalization. Drives the handler via
// firebase-functions-test's wrap()/makeChange() against the Firestore
// emulator (admin SDK env is wired up in setup/admin.setup.ts).

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { deleteAfterQuery } from '../helpers/deletedSubject';
import { syncVillageDenormalization } from '../../village/syncVillageDenormalization';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });
const wrapped = ft.wrap(syncVillageDenormalization);

const MUNICIPALITY_ID = 'mun-test';
const EVENT_ID = 'event-test';

interface MunicipalityShape {
  name: string;
  escudoManualUrl: string | null;
  escudoUrl: string | null;
  coordinates: unknown;
  community?: unknown;
}

function municipality(overrides: Partial<MunicipalityShape> = {}): MunicipalityShape {
  return {
    name: 'Villarriba',
    escudoManualUrl: null,
    escudoUrl: null,
    coordinates: null,
    ...overrides,
  };
}

async function seedEvent(villageCoverImage: string | null): Promise<void> {
  const now = new Date();
  await admin.firestore().doc(`events/${EVENT_ID}`).set({
    title: 'Fiesta Mayor',
    description: 'Gran fiesta',
    startDate: now,
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'plaza' },
    imageURL: null,
    maxAttendees: null,
    telephoneRequired: false,
    status: 'published',
    organizerUserIds: ['user-1'],
    organizerOrgIds: [],
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    municipalityId: MUNICIPALITY_ID,
    villageName: 'Villarriba',
    villageSlug: 'villarriba',
    villageCoverImage,
    villageCoordinates: null,
    confirmedCount: 0,
    totalCount: 0,
    endBoundary: now,
  });
}

async function fireTrigger(
  before: MunicipalityShape,
  after: MunicipalityShape,
): Promise<void> {
  const beforeSnap = ft.firestore.makeDocumentSnapshot(
    before as unknown as Record<string, unknown>,
    `municipalities/${MUNICIPALITY_ID}`,
  );
  const afterSnap = ft.firestore.makeDocumentSnapshot(
    after as unknown as Record<string, unknown>,
    `municipalities/${MUNICIPALITY_ID}`,
  );
  const change = ft.makeChange(beforeSnap, afterSnap);
  await wrapped({
    data: change,
    params: { municipalityId: MUNICIPALITY_ID },
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

describe('syncVillageDenormalization', () => {
  it('updates the other events when one is deleted between the query and the write', async () => {
    await seedEvent(null);
    await admin.firestore().doc('events/event-gone').set({ municipalityId: MUNICIPALITY_ID, villageName: 'Villarriba' });

    const race = deleteAfterQuery('events/event-gone');
    try {
      await expect(fireTrigger(municipality(), municipality({ name: 'Villabajo' }))).resolves.not.toThrow();
    } finally {
      race.restore();
    }

    expect((await admin.firestore().doc('events/event-gone').get()).exists).toBe(false);
    expect((await admin.firestore().doc(`events/${EVENT_ID}`).get()).get('villageName')).toBe('Villabajo');
  });

  it('propagates escudoManualUrl to villageCoverImage on events', async () => {
    await seedEvent(null);

    const before = municipality({ escudoManualUrl: null, escudoUrl: null });
    const after = municipality({ escudoManualUrl: 'https://x/manual.png', escudoUrl: 'https://cdn.example/escudo.png' });

    await fireTrigger(before, after);

    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    expect(eventDoc.get('villageCoverImage')).toBe('https://x/manual.png');
  });

  it('falls back to escudoUrl when escudoManualUrl is absent', async () => {
    await seedEvent(null);

    const before = municipality({ escudoManualUrl: null, escudoUrl: null });
    const after = municipality({ escudoManualUrl: null, escudoUrl: 'https://cdn.example/escudo-fallback.png' });

    await fireTrigger(before, after);

    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    expect(eventDoc.get('villageCoverImage')).toBe('https://cdn.example/escudo-fallback.png');
  });

  it('propagates when only escudo changes (name/coords unchanged)', async () => {
    await seedEvent('old-url');

    const base = municipality({ escudoManualUrl: 'https://x/old.png', escudoUrl: null });
    const after = municipality({ escudoManualUrl: 'https://x/new.png', escudoUrl: null });

    await fireTrigger(base, after);

    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    expect(eventDoc.get('villageCoverImage')).toBe('https://x/new.png');
  });

  it('does not write when name, coords, and escudo are all unchanged', async () => {
    // Seed a sentinel value that does NOT match the escudo URL — a spurious
    // write would overwrite this with the escudo URL and the assertion would fail.
    await seedEvent('SENTINEL-should-not-be-touched');

    const same = municipality({ escudoManualUrl: 'https://x/stable.png', escudoUrl: null, name: 'Villarriba' });

    await fireTrigger(same, same);

    // Handler must have returned early (no-op): the sentinel must be untouched.
    const eventDoc = await admin.firestore().doc(`events/${EVENT_ID}`).get();
    expect(eventDoc.get('villageCoverImage')).toBe('SENTINEL-should-not-be-touched');
  });
});
