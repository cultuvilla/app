import { describe, expect, it } from 'vitest';
import {
  entityEditPath,
  entityPath,
  entityRef,
  eventLinkTarget,
  festivalPosterLinkTarget,
  isReservedRootSegment,
  newWordPath,
  orgJoinPath,
  parseAppPath,
  parseEntityRef,
  seatClaimPath,
  slugify,
  userPath,
  villagePath,
  villageSectionPath,
  wordPath,
  wrappedPath,
} from '../../src/utils/urls';

const fiesta = { id: 'evt123', title: 'Fiestas de San Roque 2026', villageSlug: 'matabuena' };

describe('slugify', () => {
  it('folds accents and ñ, lowercases, and dashes everything else', () => {
    expect(slugify('  Peñafiel ')).toBe('penafiel');
    expect(slugify("L'Hospitalet de Llobregat")).toBe('l-hospitalet-de-llobregat');
    expect(slugify('Donostia/San Sebastián')).toBe('donostia-san-sebastian');
    expect(slugify('¡Fiestas!  2026')).toBe('fiestas-2026');
  });

  it('never emits the ref separator', () => {
    expect(slugify('a_b__c')).toBe('a-b-c');
  });
});

describe('entity refs', () => {
  it('puts the title slug before the id', () => {
    expect(entityRef('Fiestas de San Roque', 'evt123')).toBe('fiestas-de-san-roque_evt123');
  });

  it('keeps a dashed or underscored id whole — the first _ is the split', () => {
    const id = 'seed_demo-1_iglesia-alpajes';
    expect(parseEntityRef(entityRef('Iglesia de San Antonio', id))).toBe(id);
  });

  it('survives an empty title', () => {
    expect(parseEntityRef(entityRef('¿?', 'x_1'))).toBe('x_1');
  });

  it('takes a ref without a separator as a bare id', () => {
    expect(parseEntityRef('evt123')).toBe('evt123');
  });

  it('rejects an empty id', () => {
    expect(parseEntityRef('fiestas_')).toBeNull();
    expect(() => entityRef('x', '')).toThrow(/id/);
  });
});

describe('path builders', () => {
  it('puts the pueblo first and speaks Spanish', () => {
    expect(villagePath('matabuena')).toBe('/matabuena');
    expect(villageSectionPath('matabuena', 'lugares')).toBe('/matabuena/lugares');
    expect(entityPath('event', fiesta)).toBe('/matabuena/evento/fiestas-de-san-roque-2026_evt123');
    expect(entityPath('news', fiesta)).toMatch(/^\/matabuena\/noticia\//);
    expect(entityPath('organization', fiesta)).toMatch(/^\/matabuena\/entidad\//);
    expect(entityPath('place', fiesta)).toMatch(/^\/matabuena\/lugar\//);
    expect(entityPath('barrio', fiesta)).toMatch(/^\/matabuena\/barrio\//);
    expect(entityPath('festivalPoster', fiesta)).toMatch(/^\/matabuena\/cartel\//);
    expect(entityEditPath('place', fiesta)).toMatch(/\/editar$/);
    expect(orgJoinPath(fiesta)).toMatch(/\/entidad\/.+\/unirse$/);
    expect(seatClaimPath(fiesta, 'tok')).toBe(
      '/matabuena/evento/fiestas-de-san-roque-2026_evt123/plaza/tok',
    );
    expect(wordPath('matabuena', 'abarca')).toBe('/matabuena/palabra/abarca');
    expect(newWordPath('matabuena')).toBe('/matabuena/palabra/nueva');
    expect(userPath('u1')).toBe('/usuario/u1');
  });

  it('refuses to build a path without a pueblo', () => {
    expect(() => entityPath('event', { ...fiesta, villageSlug: '' })).toThrow(/villageSlug/);
  });
});

describe('parseAppPath', () => {
  it('round-trips every shareable path', () => {
    expect(parseAppPath(villagePath('matabuena'))).toEqual({ type: 'village', villageSlug: 'matabuena' });
    expect(parseAppPath(entityPath('event', fiesta))).toEqual({
      type: 'entity',
      kind: 'event',
      villageSlug: 'matabuena',
      ref: 'fiestas-de-san-roque-2026_evt123',
      id: 'evt123',
    });
    expect(parseAppPath(orgJoinPath(fiesta))).toMatchObject({ kind: 'organization', join: true });
    expect(parseAppPath(seatClaimPath(fiesta, 'tok'))).toEqual({
      type: 'seatClaim',
      villageSlug: 'matabuena',
      ref: 'fiestas-de-san-roque-2026_evt123',
      id: 'evt123',
      token: 'tok',
    });
    expect(parseAppPath(userPath('u1'))).toEqual({ type: 'user', uid: 'u1' });
  });

  it('round-trips a fiestas Wrapped', () => {
    expect(wrappedPath('matabuena', 2026)).toBe('/matabuena/fiestas/2026');
    expect(parseAppPath(wrappedPath('matabuena', 2026))).toEqual({
      type: 'wrapped',
      villageSlug: 'matabuena',
      year: 2026,
    });
  });

  it('reads only a four-digit year as a Wrapped', () => {
    expect(parseAppPath('/matabuena/fiestas')).toBeNull();
    expect(parseAppPath('/matabuena/fiestas/26')).toBeNull();
    expect(parseAppPath('/matabuena/fiestas/agosto')).toBeNull();
    expect(parseAppPath('/matabuena/fiestas/2026/x')).toBeNull();
    expect(parseAppPath('/ajustes/fiestas/2026')).toBeNull();
  });

  it('tolerates a trailing slash', () => {
    expect(parseAppPath('/matabuena/')).toEqual({ type: 'village', villageSlug: 'matabuena' });
  });

  it('does not read app routes as pueblos', () => {
    expect(parseAppPath('/ajustes')).toBeNull();
    expect(parseAppPath('/descarga')).toBeNull();
    expect(parseAppPath('/persona/p1')).toBeNull();
  });

  it('returns null for in-app-only and unknown paths', () => {
    expect(parseAppPath('/')).toBeNull();
    expect(parseAppPath('/matabuena/lugares')).toBeNull();
    expect(parseAppPath('/matabuena/banana/x_1')).toBeNull();
    expect(parseAppPath('/matabuena/evento/x_1/unirse')).toBeNull();
    expect(parseAppPath('/matabuena/lugar/x_1/editar')).toBeNull();
    expect(parseAppPath('/matabuena/evento/x_1/plaza')).toBeNull();
    expect(parseAppPath('/%E0%A4%A')).toBeNull();
  });
});

describe('reserved segments', () => {
  it('covers the app routes and the files Hosting serves', () => {
    for (const s of ['ajustes', 'crear', 'descarga', 'robots.txt', 'sitemap.xml']) {
      expect(isReservedRootSegment(s)).toBe(true);
    }
    expect(isReservedRootSegment('matabuena')).toBe(false);
  });
});

describe('link targets', () => {
  it('keeps a private event title out of its URL', () => {
    const target = eventLinkTarget({ ...fiesta, visibilityOrgId: 'org1' });
    expect(entityPath('event', target)).toBe('/matabuena/evento/evento-privado_evt123');
    expect(entityPath('event', eventLinkTarget({ ...fiesta, visibilityOrgId: null }))).toContain('fiestas-de-san-roque');
  });

  it('names an untitled cartel by its year', () => {
    const target = festivalPosterLinkTarget({ id: 'c1', title: null, year: 1987, villageSlug: 'matabuena' });
    expect(entityPath('festivalPoster', target)).toBe('/matabuena/cartel/cartel-1987_c1');
  });
});
