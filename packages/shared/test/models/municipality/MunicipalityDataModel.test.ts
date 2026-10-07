import { describe, it, expect } from 'vitest';
import {
  MunicipalityDataSchema,
  BarrioDataSchema,
  PlaceDataSchema,
  VillageCommunitySchema,
  buildMunicipalityData,
  buildVillageCommunity,
  buildBarrioData,
  buildPlaceData,
  municipalitySearchKey,
  municipalitySearchPrefixes,
  matchedLocality,
  hasManualEscudo,
  escudoFullUrl,
  escudoThumbDisplayUrl,
} from '../../../src/models/municipality/MunicipalityDataModel';

const validMunicipality = {
  name: 'Jódar',
  nameLower: 'jodar',
  nameAliases: [],
  localityNames: [],
  searchPrefixes: ['j', 'jo', 'jod', 'joda', 'jodar'],
  province: 'Jaén',
  comunidadAutonoma: 'Andalucía',
  codigoINE: '23050', slug: 'pueblo-23050',
  coordinates: { lat: 37.85, lng: -3.35 },
  locationLabel: 'Plaza de España, Jódar',
  mapZoom: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  escudoUrl: null,
  escudoThumbUrl: null,
  escudoManualUrl: null,
  community: null,
  communityActive: false,
};

describe('MunicipalityDataSchema', () => {
  it('parses a valid municipality with null community', () => {
    expect(() => MunicipalityDataSchema.parse(validMunicipality)).not.toThrow();
  });

  it('requires locationLabel to be present, so pre-field docs are caught by the converter', () => {
    const { locationLabel: _omitted, ...withoutLabel } = validMunicipality;
    expect(() => MunicipalityDataSchema.parse(withoutLabel)).toThrow();
    expect(() => MunicipalityDataSchema.parse({ ...withoutLabel, locationLabel: null })).not.toThrow();
  });

  it('parses a municipality with an active community', () => {
    expect(() =>
      MunicipalityDataSchema.parse({
        ...validMunicipality,
        community: {
          description: 'Hola',
          organizerId: 'u1', organizerSex: null,
          profileForm: null,
          fiestas: [],
          activatedAt: new Date('2026-01-02T00:00:00Z'),
        },
        communityActive: true,
      }),
    ).not.toThrow();
  });

  it('rejects a missing required field', () => {
    const { name: _name, ...rest } = validMunicipality;
    expect(() => MunicipalityDataSchema.parse(rest)).toThrow();
  });

  it('rejects coordinates with wrong shape', () => {
    expect(() =>
      MunicipalityDataSchema.parse({
        ...validMunicipality,
        coordinates: { latitude: 1, longitude: 2 },
      }),
    ).toThrow();
  });
});

describe('VillageCommunitySchema', () => {
  it('parses a community with a profileForm', () => {
    expect(() =>
      VillageCommunitySchema.parse({
        description: '',
        organizerId: 'u', organizerSex: null,
        profileForm: {
          fields: [{ source: 'predefined', key: 'barrio', required: true }],
          updatedAt: new Date(),
        },
        fiestas: [],
        activatedAt: new Date(),
      }),
    ).not.toThrow();
  });
});

describe('buildMunicipalityData', () => {
  it('fills defaults and derives nameLower', () => {
    const built = buildMunicipalityData({
      name: 'Ávila',
      province: 'Ávila',
      comunidadAutonoma: 'Castilla y León',
      codigoINE: '05019', slug: 'pueblo-05019',
    });
    expect(built.nameLower).toBe(municipalitySearchKey('Ávila'));
    expect(built.coordinates).toBeNull();
    expect(built.locationLabel).toBeNull();
    expect(built.community).toBeNull();
    expect(built.communityActive).toBe(false);
    expect(() => MunicipalityDataSchema.parse(built)).not.toThrow();
  });

  it('preserves provided LatLng coordinates', () => {
    const built = buildMunicipalityData({
      name: 'X',
      province: 'P',
      comunidadAutonoma: 'C',
      codigoINE: '00000', slug: 'pueblo-00000',
      coordinates: { lat: 37.85, lng: -3.35 },
      locationLabel: 'Plaza Mayor, X',
    });
    expect(built.coordinates).toEqual({ lat: 37.85, lng: -3.35 });
    expect(built.locationLabel).toBe('Plaza Mayor, X');
  });
});

describe('escudo resolution helpers', () => {
  const wikidata = { escudoUrl: 'wiki-full', escudoThumbUrl: 'wiki-thumb', escudoManualUrl: null };
  const manual = { escudoUrl: 'wiki-full', escudoThumbUrl: 'wiki-thumb', escudoManualUrl: 'manual' };
  const none = { escudoUrl: null, escudoThumbUrl: null, escudoManualUrl: null };
  const legacy = { escudoUrl: 'wiki-full', escudoThumbUrl: 'wiki-thumb' }; // pre-field doc

  it('hasManualEscudo is true only when a manual upload exists', () => {
    expect(hasManualEscudo(manual)).toBe(true);
    expect(hasManualEscudo(wikidata)).toBe(false);
    expect(hasManualEscudo(legacy)).toBe(false);
  });

  it('escudoFullUrl prefers the manual upload, else Wikidata, else null', () => {
    expect(escudoFullUrl(manual)).toBe('manual');
    expect(escudoFullUrl(wikidata)).toBe('wiki-full');
    expect(escudoFullUrl(none)).toBeNull();
  });

  it('escudoThumbDisplayUrl prefers the manual upload, else the Wikidata thumb', () => {
    expect(escudoThumbDisplayUrl(manual)).toBe('manual');
    expect(escudoThumbDisplayUrl(wikidata)).toBe('wiki-thumb');
    expect(escudoThumbDisplayUrl(none)).toBeNull();
  });
});

describe('buildVillageCommunity', () => {
  it('defaults profileForm to null', () => {
    const c = buildVillageCommunity({ description: 'p', organizerId: 'a' });
    expect(c.profileForm).toBeNull();
    expect(() => VillageCommunitySchema.parse(c)).not.toThrow();
  });

  // A village "started" by a villager has no organizer yet — organizerId is null.
  it('defaults organizerId to null when omitted (no organizer yet)', () => {
    const c = buildVillageCommunity({ description: 'p' });
    expect(c.organizerId).toBeNull();
    expect(() => VillageCommunitySchema.parse(c)).not.toThrow();
  });

  it('VillageCommunitySchema accepts a null organizerId', () => {
    expect(() =>
      VillageCommunitySchema.parse({
        description: '',
        organizerId: null, organizerSex: null,
        profileForm: null,
        fiestas: [],
        activatedAt: new Date(),
      }),
    ).not.toThrow();
  });
});

describe('BarrioDataSchema and buildBarrioData', () => {
  it('builds, defaults images to [] and residentCount to 0, and round-trips', () => {
    const b = buildBarrioData({ name: 'El Castillo', municipalityId: 'm1' });
    expect(b.images).toEqual([]);
    expect(b.residentCount).toBe(0);
    expect(() => BarrioDataSchema.parse(b)).not.toThrow();
  });

  it('keeps provided images ordered (cover first)', () => {
    const b = buildBarrioData({ name: 'El Castillo', municipalityId: 'm1', images: ['https://x/b.png', 'https://x/b2.png'] });
    expect(b.images).toEqual(['https://x/b.png', 'https://x/b2.png']);
    expect(() => BarrioDataSchema.parse(b)).not.toThrow();
  });

  it('rejects more than 5 images at the schema boundary', () => {
    const b = buildBarrioData({ name: 'El Castillo', municipalityId: 'm1' });
    expect(() =>
      BarrioDataSchema.parse({ ...b, images: ['1', '2', '3', '4', '5', '6'] }),
    ).toThrow();
  });
});

describe('PlaceDataSchema and buildPlaceData', () => {
  it('defaults description to null and images to [], keeps kind, and round-trips', () => {
    const p = buildPlaceData({ name: 'C', kind: 'cemetery', municipalityId: 'm1' });
    expect(p.description).toBeNull();
    expect(p.images).toEqual([]);
    expect(p.kind).toBe('cemetery');
    expect(p.burialCount).toBe(0);
    expect(p.contributorUserIds).toEqual([]);
    expect(p.contributorOrgIds).toEqual([]);
    expect(() => PlaceDataSchema.parse(p)).not.toThrow();
  });

  it('keeps provided images ordered (cover first)', () => {
    const p = buildPlaceData({ name: 'C', kind: 'church', municipalityId: 'm1', images: ['https://x/p.png', 'https://x/p2.png'] });
    expect(p.images).toEqual(['https://x/p.png', 'https://x/p2.png']);
    expect(() => PlaceDataSchema.parse(p)).not.toThrow();
  });

  it('rejects more than 5 images at the schema boundary', () => {
    const p = buildPlaceData({ name: 'C', kind: 'church', municipalityId: 'm1' });
    expect(() =>
      PlaceDataSchema.parse({ ...p, images: ['1', '2', '3', '4', '5', '6'] }),
    ).toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      PlaceDataSchema.parse({
        name: 'X',
        kind: 'castle',
        description: null,
        municipalityId: 'm1',
        images: [],
        createdAt: new Date(),
      }),
    ).toThrow();
  });
});

describe('municipalitySearchPrefixes', () => {
  it('indexes every word, not just the first, so the leading generic is optional', () => {
    const prefixes = municipalitySearchPrefixes('Villanueva de las Manzanas');
    // The bug: a resident searches for the distinctive word, not the generic
    // "Villanueva de las" that four dozen Spanish municipalities share.
    expect(prefixes).toContain('manzanas');
    expect(prefixes).toContain('manzan');
    expect(prefixes).toContain('villanueva');
  });

  it('keeps whole-string prefixes so multi-word typing still narrows', () => {
    const prefixes = municipalitySearchPrefixes('Villanueva de las Manzanas');
    expect(prefixes).toContain('villanueva de las m');
    expect(prefixes).toContain('villanueva de las manzanas');
  });

  it('strips accents so "avila" finds "Ávila"', () => {
    expect(municipalitySearchPrefixes('Ávila')).toContain('avila');
    expect(municipalitySearchPrefixes('Castellón de la Plana')).toContain('castellon');
  });

  it('indexes official-language aliases alongside the Spanish name', () => {
    const prefixes = municipalitySearchPrefixes('San Sebastián', ['Donostia', 'Donostia-San Sebastián']);
    expect(prefixes).toContain('donostia');
    expect(prefixes).toContain('sebastian');
    expect(prefixes).toContain('san sebastian');
  });

  it('drops standalone connectives so every "X de Y" name does not share a token', () => {
    const prefixes = municipalitySearchPrefixes('Villanueva de las Manzanas');
    expect(prefixes).not.toContain('de');
    expect(prefixes).not.toContain('las');
    // ...but a whole-string prefix that happens to span one is still fine.
    expect(prefixes).toContain('villanueva de');
  });

  it('keeps a connective that is the only word (Sa Pobla stays findable as "sa")', () => {
    expect(municipalitySearchPrefixes('Es')).toContain('es');
  });

  it('splits on punctuation, not just whitespace', () => {
    const prefixes = municipalitySearchPrefixes("Castillo de Aro, Playa de Aro y S'Agaró");
    expect(prefixes).toContain('playa');
    expect(prefixes).toContain('agaro');
  });

  it('returns a deduplicated, sorted array so the field is stable across rebuilds', () => {
    const a = municipalitySearchPrefixes('San Sebastián', ['Donostia']);
    const b = municipalitySearchPrefixes('San Sebastián', ['Donostia']);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect([...a].sort()).toEqual(a);
  });

  it('is empty for an empty name', () => {
    expect(municipalitySearchPrefixes('')).toEqual([]);
  });

  it('stays small enough to be a sane Firestore array index', () => {
    const prefixes = municipalitySearchPrefixes("Castillo de Aro, Playa de Aro y S'Agaró");
    expect(prefixes.length).toBeLessThan(200);
  });
});

describe('MunicipalityDataSchema search fields', () => {
  it('requires searchPrefixes, so a doc predating the field is caught by the converter', () => {
    const { searchPrefixes: _omitted, ...without } = validMunicipality;
    expect(() => MunicipalityDataSchema.parse(without)).toThrow();
  });

  it('requires nameAliases', () => {
    const { nameAliases: _omitted, ...without } = validMunicipality;
    expect(() => MunicipalityDataSchema.parse(without)).toThrow();
  });
});

describe('buildMunicipalityData search fields', () => {
  it('derives searchPrefixes from the name and the aliases', () => {
    const built = buildMunicipalityData({
      name: 'San Sebastián',
      province: 'Guipúzcoa',
      comunidadAutonoma: 'País Vasco',
      codigoINE: '20069', slug: 'pueblo-20069',
      nameAliases: ['Donostia'],
    });
    expect(built.nameAliases).toEqual(['Donostia']);
    expect(built.searchPrefixes).toContain('donostia');
    expect(built.searchPrefixes).toContain('sebastian');
    expect(built.nameLower).toBe('san sebastian');
  });

  it('defaults nameAliases to an empty array', () => {
    const built = buildMunicipalityData({
      name: 'Jódar',
      province: 'Jaén',
      comunidadAutonoma: 'Andalucía',
      codigoINE: '23050', slug: 'pueblo-23050',
    });
    expect(built.nameAliases).toEqual([]);
    expect(built.searchPrefixes).toContain('jodar');
  });
});

describe('municipalitySearchPrefixes with localities', () => {
  it('finds the municipio by the name of a pedanía inside it', () => {
    // The report that started all of this: a resident of Villarino de Manzanas
    // searched for Villarino de Manzanas. It is an entidad singular of
    // Figueruela de Arriba, so the municipio is what has to answer for it.
    const prefixes = municipalitySearchPrefixes('Figueruela de Arriba', [], [
      'Villarino de Manzanas',
    ]);
    expect(prefixes).toContain('villarino de manzanas');
    expect(prefixes).toContain('villarino');
    // ...and by a non-leading word of the pedanía too, same as for the municipio.
    expect(prefixes).toContain('manzanas');
    // The municipio's own name keeps working.
    expect(prefixes).toContain('figueruela');
    expect(prefixes).toContain('arriba');
  });

  it('indexes every locality, not just the first', () => {
    const prefixes = municipalitySearchPrefixes('Figueruela de Arriba', [], [
      'Villarino de Manzanas',
      'Riomanzanas',
      'Moldones',
    ]);
    expect(prefixes).toContain('riomanzanas');
    expect(prefixes).toContain('moldones');
  });

  it('keeps localities and aliases independent', () => {
    const prefixes = municipalitySearchPrefixes('San Sebastián', ['Donostia'], ['Igueldo']);
    expect(prefixes).toContain('donostia');
    expect(prefixes).toContain('igueldo');
  });

  it('stays deduplicated and sorted with localities in play', () => {
    const prefixes = municipalitySearchPrefixes('Figueruela de Arriba', [], [
      'Figueruela de Arriba',
      'Villarino de Manzanas',
    ]);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect([...prefixes].sort()).toEqual(prefixes);
  });
});

describe('matchedLocality', () => {
  it('names the pedanía that made a municipio match', () => {
    expect(matchedLocality(['Villarino de Manzanas', 'Moldones'], 'villarino')).toBe(
      'Villarino de Manzanas',
    );
    expect(matchedLocality(['Villarino de Manzanas', 'Moldones'], 'manzanas')).toBe(
      'Villarino de Manzanas',
    );
    expect(matchedLocality(['Villarino de Manzanas', 'Moldones'], 'mold')).toBe('Moldones');
  });

  it('returns null when the query did not come from a locality', () => {
    expect(matchedLocality(['Villarino de Manzanas'], 'figueruela')).toBeNull();
    expect(matchedLocality([], 'villarino')).toBeNull();
    expect(matchedLocality(['Villarino de Manzanas'], '')).toBeNull();
  });

  it('matches accent-insensitively, like the index does', () => {
    expect(matchedLocality(['Vegaquemada de Arriba'], 'vegaquemada')).toBe(
      'Vegaquemada de Arriba',
    );
    expect(matchedLocality(['Cañizo'], 'caniz')).toBe('Cañizo');
  });
});

describe('buildMunicipalityData localities', () => {
  it('derives searchPrefixes from name, aliases and localities together', () => {
    const built = buildMunicipalityData({
      name: 'Figueruela de Arriba',
      province: 'Zamora',
      comunidadAutonoma: 'Castilla y León',
      codigoINE: '49069', slug: 'pueblo-49069',
      localityNames: ['Villarino de Manzanas'],
    });
    expect(built.localityNames).toEqual(['Villarino de Manzanas']);
    expect(built.searchPrefixes).toContain('villarino');
  });

  it('defaults localityNames to an empty array', () => {
    const built = buildMunicipalityData({
      name: 'Jódar',
      province: 'Jaén',
      comunidadAutonoma: 'Andalucía',
      codigoINE: '23050', slug: 'pueblo-23050',
    });
    expect(built.localityNames).toEqual([]);
  });
});

describe('MunicipalityDataSchema localityNames', () => {
  it('requires localityNames, so a doc predating the field is caught', () => {
    const { localityNames: _omitted, ...without } = validMunicipality;
    expect(() => MunicipalityDataSchema.parse(without)).toThrow();
  });
});


describe('BarrioDataSchema kind + source', () => {
  it('defaults a hand-created barrio to kind "barrio", source "user"', () => {
    const b = buildBarrioData({ name: 'El Arrabal', municipalityId: 'm1' });
    expect(b.kind).toBe('barrio');
    expect(b.source).toBe('user');
    expect(b.isSeat).toBe(false);
    expect(() => BarrioDataSchema.parse(b)).not.toThrow();
  });

  it('carries the seeded kinds through the builder', () => {
    for (const kind of ['pedania', 'aldea', 'parroquia'] as const) {
      const b = buildBarrioData({
        name: 'X',
        municipalityId: 'm1',
        kind,
        source: 'osm',
      });
      expect(b.kind).toBe(kind);
      expect(b.source).toBe('osm');
      expect(() => BarrioDataSchema.parse(b)).not.toThrow();
    }
  });

  it('rejects a kind outside the four', () => {
    const b = buildBarrioData({ name: 'X', municipalityId: 'm1' });
    expect(() => BarrioDataSchema.parse({ ...b, kind: 'pueblo' })).toThrow();
  });

  it('requires kind and source, so a doc predating them is caught', () => {
    const b = buildBarrioData({ name: 'X', municipalityId: 'm1' });
    const { kind: _k, ...noKind } = b;
    const { source: _s, ...noSource } = b;
    expect(() => BarrioDataSchema.parse(noKind)).toThrow();
    expect(() => BarrioDataSchema.parse(noSource)).toThrow();
  });

  it('marks the municipal seat', () => {
    // The seat needs a row of its own or residents of the main village have
    // nowhere to live while residents of the pedanías do. It is frequently NOT
    // the municipality's own name — Aramaio's seat is a village called Ibarra.
    const b = buildBarrioData({
      name: 'Ibarra',
      municipalityId: 'm1',
      kind: 'pedania',
      source: 'osm',
      isSeat: true,
    });
    expect(b.isSeat).toBe(true);
    expect(() => BarrioDataSchema.parse(b)).not.toThrow();
  });
});
