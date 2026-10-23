// The nightly ranking behind "Descubre otros pueblos": counts each active
// pueblo's public content against the emulator and writes villageRankings/top.
import { beforeEach, describe, expect, it } from 'vitest';
import * as admin from 'firebase-admin';
import { buildMunicipalityData, buildVillageCommunity } from '@cultuvilla/shared/models';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { computeVillageRanking, refreshVillageRanking } from '../../../village/refreshVillageRanking';

const db = () => admin.firestore();

async function seedVillage(id: string, name: string, opts: { active?: boolean; description?: string } = {}) {
  const active = opts.active ?? true;
  await db()
    .doc(`municipalities/${id}`)
    .set({
      ...buildMunicipalityData({ name, province: 'Segovia', comunidadAutonoma: 'Castilla y León', codigoINE: id, slug: id }),
      community: active ? buildVillageCommunity({ description: opts.description ?? '', organizerId: null }) : null,
      communityActive: active,
    });
}

const seed = (path: string, data: Record<string, unknown>) => db().doc(path).set(data);

beforeEach(async () => {
  await resetEmulators();
});

describe('computeVillageRanking', () => {
  it('ranks active pueblos by their public content, ignoring hidden and private items', async () => {
    await seedVillage('rico', 'Rico');
    await seedVillage('vacio', 'Vacío');
    await seedVillage('dormido', 'Dormido', { active: false });

    await seed('news/n1', { municipalityId: 'rico', status: 'active' });
    await seed('news/n2', { municipalityId: 'rico', status: 'active' });
    await seed('organizations/o1', { municipalityId: 'rico', status: 'approved' });
    await seed('municipalities/rico/places/p1', { status: 'active' });
    // None of these count: hidden, pending, private, or another village's.
    await seed('news/hidden', { municipalityId: 'vacio', status: 'hidden' });
    await seed('organizations/pending', { municipalityId: 'vacio', status: 'pending' });
    await seed('events/private', { municipalityId: 'vacio', visibility: 'private', status: 'published' });

    const ranked = await computeVillageRanking(db());

    expect(ranked.map((v) => v.id)).toEqual(['rico', 'vacio']);
    expect(ranked[0]?.score).toBeGreaterThan(0);
    expect(ranked[1]?.score).toBe(0);
    expect(ranked[0]).toMatchObject({ name: 'Rico', slug: 'rico', province: 'Segovia', manualEscudo: false });
  });

  it('counts a complete profile in a pueblo with no content yet', async () => {
    await seedVillage('a', 'Alfa');
    await seedVillage('b', 'Beta', { description: 'Un pueblo con mucha historia.' });
    expect((await computeVillageRanking(db())).map((v) => v.id)).toEqual(['b', 'a']);
  });
});

describe('refreshVillageRanking', () => {
  it('writes the ranking to villageRankings/top', async () => {
    await seedVillage('rico', 'Rico');
    await seed('news/n1', { municipalityId: 'rico', status: 'active' });

    await refreshVillageRanking.run({ scheduleTime: new Date().toISOString() } as Parameters<typeof refreshVillageRanking.run>[0]);

    const doc = await db().doc('villageRankings/top').get();
    expect(doc.get('villages')).toEqual([expect.objectContaining({ id: 'rico', slug: 'rico' })]);
    expect(doc.get('computedAt')).toBeInstanceOf(admin.firestore.Timestamp);
  });
});
