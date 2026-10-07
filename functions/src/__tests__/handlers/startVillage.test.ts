// Handler test for the startVillage callable.
// A villager activates a dormant municipality's community WITHOUT becoming its
// organizer: the community is created with organizerId === null, and the caller
// is added as a plain member.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as admin from 'firebase-admin';
import functionsTestFactory from 'firebase-functions-test';
import { resetEmulators } from '../helpers/firestoreEmulator';
import { startVillage } from '../../village/startVillage';

const ft = functionsTestFactory({ projectId: process.env.GCLOUD_PROJECT || 'cultuvilla-test' });

const MUNICIPALITY_ID = 'mun-1';
const STARTER_ID = 'alice';

async function seedMunicipality(communityActive: boolean): Promise<void> {
  const now = new Date();
  await admin
    .firestore()
    .doc(`municipalities/${MUNICIPALITY_ID}`)
    .set({
      name: 'Villarriba',
      nameLower: 'villarriba',
      nameAliases: [],
      localityNames: [],
      searchPrefixes: ['v', 'vi', 'vil', 'vill', 'villa', 'villar', 'villarr', 'villarri', 'villarrib', 'villarriba'],
      province: 'Madrid',
      comunidadAutonoma: 'Madrid',
      codigoINE: '28000',
      slug: 'pueblo-28000',
      coordinates: null,
      locationLabel: null,
      mapZoom: null,
      createdAt: now,
      escudoUrl: null,
      escudoThumbUrl: null,
      escudoManualUrl: null,
      communityActive,
      community: communityActive
        ? { description: 'ya', organizerId: 'someone', organizerSex: null, profileForm: null, fiestas: [], activatedAt: now }
        : null,
    });
}

interface CallableResult {
  ok: true;
}


/** Seed the OSM reference data activation reads. */
async function seedSettlements(
  codigoINE: string,
  settlements: {
    name: string;
    kind: 'barrio' | 'pedania' | 'aldea' | 'parroquia';
    isSeat?: boolean;
    lat?: number | null;
    lng?: number | null;
  }[],
): Promise<void> {
  await admin
    .firestore()
    .doc(`_admin/settlements/seeds/${codigoINE}`)
    .set({
      codigoINE,
      name: 'Villarriba',
      settlements: settlements.map((s) => ({
        name: s.name,
        kind: s.kind,
        isSeat: s.isSeat ?? false,
        lat: s.lat ?? null,
        lng: s.lng ?? null,
      })),
    });
}

async function readBarrios(): Promise<
  { id: string; name: string; kind: string; source: string; isSeat: boolean; proposedBy: unknown }[]
> {
  const snap = await admin
    .firestore()
    .collection(`municipalities/${MUNICIPALITY_ID}/barrios`)
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    name: d.data().name as string,
    kind: d.data().kind as string,
    source: d.data().source as string,
    isSeat: d.data().isSeat as boolean,
    proposedBy: d.data().proposedBy,
  }));
}

async function callStart(opts: { uid: string | null; data: unknown }): Promise<CallableResult> {
  const wrapped = ft.wrap(startVillage as unknown as Parameters<typeof ft.wrap>[0]);
  return (await wrapped({
    data: opts.data,
    auth: opts.uid ? { uid: opts.uid, token: {} } : undefined,
  } as unknown as Parameters<typeof wrapped>[0])) as unknown as CallableResult;
}

describe('startVillage (callable)', () => {
  beforeAll(async () => {
    await resetEmulators();
  });

  beforeEach(async () => {
    await resetEmulators();
  });

  afterAll(() => {
    ft.cleanup();
  });

  it('throws unauthenticated when no auth context', async () => {
    await expect(
      callStart({ uid: null, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/unauthenticated|inici/i);
  });

  it('throws invalid-argument when municipalityId is missing', async () => {
    await expect(callStart({ uid: STARTER_ID, data: {} })).rejects.toThrow(
      /municipalityId|invalid-argument/i,
    );
  });

  it('throws not-found when the municipality does not exist', async () => {
    await expect(
      callStart({ uid: STARTER_ID, data: { municipalityId: 'missing' } }),
    ).rejects.toThrow(/no encontrado|not.?found/i);
  });

  it('throws failed-precondition when the community is already active', async () => {
    await seedMunicipality(true);
    await expect(
      callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
    ).rejects.toThrow(/ya está activa|failed-precondition/i);
  });

  it('activates the community with a null organizer and adds the starter as a member', async () => {
    await seedMunicipality(false);

    const result = await callStart({
      uid: STARTER_ID,
      data: {
        municipalityId: MUNICIPALITY_ID,
        description: '  Mi pueblo  ',
      },
    });
    expect(result.ok).toBe(true);

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.communityActive).toBe(true);
    expect(muniDoc.data()?.community?.organizerId).toBeNull();
    expect(muniDoc.data()?.community?.description).toBe('Mi pueblo');

    const memberDoc = await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}/members/${STARTER_ID}`)
      .get();
    expect(memberDoc.exists).toBe(true);
    expect(memberDoc.data()?.role).toBe('user');
  });

  it('stores the uploaded escudoManualUrl when the village has none', async () => {
    await seedMunicipality(false);

    await callStart({
      uid: STARTER_ID,
      data: {
        municipalityId: MUNICIPALITY_ID,
        escudoManualUrl: '  https://example.com/escudo.webp  ',
      },
    });

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.escudoManualUrl).toBe('https://example.com/escudo.webp');
  });

  it('never writes location during activation, ignoring any location fields sent', async () => {
    await seedMunicipality(false); // seeded with coordinates: null, mapZoom: null

    // Location is set only via the admin-only edit path, never at initiation.
    // Even a client that sends location fields must not have them persisted.
    await callStart({
      uid: STARTER_ID,
      data: {
        municipalityId: MUNICIPALITY_ID,
        coordinates: { lat: 40.4, lng: -3.7 },
        locationLabel: 'Plaza Mayor, Villarriba',
        mapZoom: 14,
      },
    });

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.coordinates).toBeNull();
    expect(muniDoc.data()?.locationLabel).toBeNull();
    expect(muniDoc.data()?.mapZoom).toBeNull();
  });

  it('ignores escudoManualUrl when the village already has a manual escudo', async () => {
    const now = new Date();
    await admin
      .firestore()
      .doc(`municipalities/${MUNICIPALITY_ID}`)
      .set({
        name: 'Villarriba',
        nameLower: 'villarriba',
        nameAliases: [],
        localityNames: [],
        searchPrefixes: ['v', 'vi', 'vil', 'vill', 'villa', 'villar', 'villarr', 'villarri', 'villarrib', 'villarriba'],
        province: 'Madrid',
        comunidadAutonoma: 'Madrid',
        codigoINE: '28000',
        slug: 'pueblo-28000',
        coordinates: null,
        locationLabel: null,
        mapZoom: null,
        createdAt: now,
        escudoUrl: null,
        escudoThumbUrl: null,
        escudoManualUrl: 'https://example.com/existing.webp',
        communityActive: false,
        community: null,
      });

    await callStart({
      uid: STARTER_ID,
      data: {
        municipalityId: MUNICIPALITY_ID,
        escudoManualUrl: 'https://example.com/new.webp',
      },
    });

    const muniDoc = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
    expect(muniDoc.data()?.escudoManualUrl).toBe('https://example.com/existing.webp');
  });

  describe('settlement seeding', () => {
    it('seeds the municipality\'s settlements on activation', async () => {
      await seedMunicipality(false);
      await seedSettlements('28000', [
        { name: 'Villarriba', kind: 'pedania', isSeat: true },
        { name: 'Villarino de Manzanas', kind: 'pedania' },
        { name: 'El Arrabal', kind: 'barrio' },
      ]);

      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });

      const barrios = await readBarrios();
      expect(barrios).toHaveLength(3);
      expect(barrios.map((b) => b.name).sort()).toEqual([
        'El Arrabal',
        'Villarino de Manzanas',
        'Villarriba',
      ]);
    });

    it('preserves each settlement\'s kind, so a pedania is not filed as a barrio', async () => {
      await seedMunicipality(false);
      await seedSettlements('28000', [
        { name: 'Samarugo', kind: 'parroquia' },
        { name: 'Ibarra', kind: 'aldea' },
        { name: 'El Arrabal', kind: 'barrio' },
      ]);

      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });

      const byName = Object.fromEntries((await readBarrios()).map((b) => [b.name, b.kind]));
      expect(byName).toEqual({
        Samarugo: 'parroquia',
        Ibarra: 'aldea',
        'El Arrabal': 'barrio',
      });
    });

    it('marks seeded rows as osm-sourced and unproposed', async () => {
      await seedMunicipality(false);
      await seedSettlements('28000', [{ name: 'Villarino', kind: 'pedania' }]);

      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });

      const [row] = await readBarrios();
      expect(row.source).toBe('osm');
      // Nobody proposed reference data; this is what tells a seeded row from a
      // hand-created one.
      expect(row.proposedBy).toBeNull();
    });

    it('carries the municipal seat flag through', async () => {
      await seedMunicipality(false);
      // The seat is frequently NOT the municipality's own name — Aramaio's is
      // a village called Ibarra — so the flag, not the name, is the signal.
      await seedSettlements('28000', [
        { name: 'Ibarra', kind: 'pedania', isSeat: true },
        { name: 'Etxaguen', kind: 'pedania' },
      ]);

      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });

      const barrios = await readBarrios();
      expect(barrios.filter((b) => b.isSeat).map((b) => b.name)).toEqual(['Ibarra']);
    });

    it('is idempotent — a second seeding does not duplicate rows', async () => {
      await seedMunicipality(false);
      await seedSettlements('28000', [
        { name: 'Villarino de Manzanas', kind: 'pedania' },
        { name: 'Moldones', kind: 'pedania' },
      ]);
      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });
      expect(await readBarrios()).toHaveLength(2);

      // startVillage is a callable; a client retry after a timeout is normal.
      // Re-activating is refused, but the seeding path itself must be safe to
      // re-run, so drive it directly.
      const { seedVillageSettlements } = await import('../../village/seedVillageSettlements.js');
      await seedVillageSettlements(admin.firestore(), MUNICIPALITY_ID, '28000');

      expect(await readBarrios()).toHaveLength(2);
    });

    it('gives a barrio and a pedania of the same name separate rows', async () => {
      await seedMunicipality(false);
      await seedSettlements('28000', [
        { name: 'El Pueblo', kind: 'barrio' },
        { name: 'El Pueblo', kind: 'pedania' },
      ]);

      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });

      const barrios = await readBarrios();
      expect(barrios).toHaveLength(2);
      expect(barrios.map((b) => b.kind).sort()).toEqual(['barrio', 'pedania']);
    });

    it('activates the village even when no seed document exists', async () => {
      // Coverage is partial — 36 municipalities have no settlements at all, and
      // beta/prod may not have run the seed backfill yet. Activation must not
      // depend on it.
      await seedMunicipality(false);

      await expect(
        callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
      ).resolves.toEqual({ ok: true });

      const muni = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
      expect(muni.data()?.communityActive).toBe(true);
      expect(await readBarrios()).toHaveLength(0);
    });

    it('activates the village even when the seed document is malformed', async () => {
      await seedMunicipality(false);
      await admin
        .firestore()
        .doc('_admin/settlements/seeds/28000')
        .set({ codigoINE: '28000', name: 'Villarriba', settlements: [{ nope: true }] });

      await expect(
        callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } }),
      ).resolves.toEqual({ ok: true });

      const muni = await admin.firestore().doc(`municipalities/${MUNICIPALITY_ID}`).get();
      expect(muni.data()?.communityActive).toBe(true);
      expect(await readBarrios()).toHaveLength(0);
    });

    it('writes past a single batch — Vigo has 829 settlements', async () => {
      await seedMunicipality(false);
      await seedSettlements(
        '28000',
        Array.from({ length: 460 }, (_, i) => ({
          name: `Aldea ${String(i)}`,
          kind: 'pedania' as const,
        })),
      );

      await callStart({ uid: STARTER_ID, data: { municipalityId: MUNICIPALITY_ID } });

      expect(await readBarrios()).toHaveLength(460);
    });
  });
});
