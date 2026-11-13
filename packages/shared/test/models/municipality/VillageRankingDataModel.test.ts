import { describe, expect, it } from 'vitest';
import {
  otherRankedVillages,
  rankVillages,
  villageProfileCompleteness,
  villageRichnessScore,
  type VillageContentCounts,
} from '../../../src/models/municipality/VillageRankingDataModel';
import { buildVillageCommunity } from '../../../src/models/municipality/MunicipalityDataModel';
import { makeActiveCommunity, makeMunicipality } from '../../factories/villageFactory';

const NONE: VillageContentCounts = {
  upcomingEvents: 0,
  events: 0,
  news: 0,
  posters: 0,
  organizations: 0,
  places: 0,
  history: 0,
  words: 0,
  people: 0,
};

const bare = () =>
  makeMunicipality({
    coordinates: null,
    community: buildVillageCommunity({ description: '', organizerId: null }),
    communityActive: true,
  });

describe('villageProfileCompleteness', () => {
  it('is zero for a pueblo with nothing filled in', () => {
    expect(villageProfileCompleteness(bare())).toBe(0);
  });

  it('counts escudo, description, map, fiestas and Embajador', () => {
    const m = makeActiveCommunity({ escudoManualUrl: 'https://x/escudo.webp' });
    const full = {
      ...m,
      community: m.community && {
        ...m.community,
        fiestas: [{ id: 'f1', name: 'San Roque', month: 8 }],
      },
    };
    expect(villageProfileCompleteness(full)).toBe(5);
  });

  it('ignores a whitespace-only description', () => {
    const m = bare();
    expect(villageProfileCompleteness({ ...m, community: m.community && { ...m.community, description: '  ' } })).toBe(0);
  });
});

describe('villageRichnessScore', () => {
  it('is zero for an empty pueblo', () => {
    expect(villageRichnessScore(bare(), NONE)).toBe(0);
  });

  it('rewards content with diminishing returns', () => {
    const one = villageRichnessScore(bare(), { ...NONE, news: 1 });
    const ten = villageRichnessScore(bare(), { ...NONE, news: 10 });
    const hundred = villageRichnessScore(bare(), { ...NONE, news: 100 });
    expect(one).toBeGreaterThan(0);
    expect(ten).toBeGreaterThan(one);
    expect(hundred).toBeLessThan(2 * ten);
  });

  it('prefers breadth: a pueblo with a bit of everything beats one with a pile of one kind', () => {
    const broad = villageRichnessScore(bare(), {
      ...NONE,
      upcomingEvents: 1,
      events: 3,
      news: 3,
      organizations: 2,
      places: 3,
    });
    const narrow = villageRichnessScore(bare(), { ...NONE, words: 200 });
    expect(broad).toBeGreaterThan(narrow);
  });
});

describe('rankVillages', () => {
  it('orders best first, ties by name, and caps the size', () => {
    const entries = [
      { id: 'b', municipality: { ...bare(), name: 'Beta' }, counts: NONE },
      { id: 'a', municipality: { ...bare(), name: 'Alfa' }, counts: NONE },
      { id: 'rich', municipality: { ...bare(), name: 'Zeta' }, counts: { ...NONE, news: 5 } },
    ];
    expect(rankVillages(entries).map((v) => v.id)).toEqual(['rich', 'a', 'b']);
    expect(rankVillages(entries, 2)).toHaveLength(2);
  });

  it('carries the display fields, preferring the manual escudo', () => {
    const m = makeActiveCommunity({ escudoUrl: 'https://w/e.webp', escudoManualUrl: 'https://m/e.webp' });
    const [v] = rankVillages([{ id: 'x', municipality: m, counts: NONE }]);
    expect(v).toMatchObject({ id: 'x', name: m.name, slug: m.slug, province: m.province, escudoUrl: 'https://m/e.webp', manualEscudo: true });
  });
});

describe('otherRankedVillages', () => {
  it('drops the pueblo being viewed and keeps the order', () => {
    const vs = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      name: id,
      slug: id,
      province: 'P',
      escudoUrl: null,
      manualEscudo: false,
      score: 10 - i,
    }));
    expect(otherRankedVillages(vs, 'b', 2).map((v) => v.id)).toEqual(['a', 'c']);
  });
});
