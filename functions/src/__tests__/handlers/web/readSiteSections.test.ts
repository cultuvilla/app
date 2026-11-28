// The read site's section and detail routes against the Firestore emulator.
// Each kind seeds one public doc the page must show, one hidden doc it must
// not, and (for top-level collections) one doc of another pueblo it must not —
// so a wrong field name, status gate or municipalityId scope in a loader fails
// here instead of quietly rendering an empty or leaky page.

import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { entityPath, festivalPosterLinkTarget, villageSectionPath } from '@cultuvilla/shared/utils';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { handle, type WebResponse } from '../../../web/handler';
import { renderDocument } from '../../../web/document';
import { PUBLIC_SECTIONS } from '../../../web/routes';

const db = () => admin.firestore();
const NOW = new Date('2026-08-01T10:00:00Z');

async function get(pathname: string): Promise<WebResponse> {
  return handle({ pathname, userAgent: null }, { db: db(), bucket: 'test-bucket', now: NOW });
}

async function html(pathname: string): Promise<{ status: number; body: string }> {
  const out = await get(pathname);
  if (out.kind !== 'page') throw new Error(`expected a page for ${pathname}, got ${out.kind === 'redirect' ? `a redirect to ${out.location}` : out.kind}`);
  return {
    status: out.page.status ?? 200,
    body: renderDocument(out.page, { canonical: `https://x${out.path}`, appPath: out.path }),
  };
}

const ts = (iso: string) => admin.firestore.Timestamp.fromDate(new Date(iso));
const at = (villageSlug: string) => ({ villageSlug });

async function seed(): Promise<void> {
  const d = db();
  const village = (name: string, slug: string) => ({ name, slug, province: 'Segovia', communityActive: true, escudoUrl: null, escudoManualUrl: null });
  await d.doc('municipalities/m1').set(village('Matabuena', 'matabuena'));
  await d.doc('municipalities/m3').set(village('Arcones', 'arcones'));
  await d.doc('municipalities/m4').set(village('Sotillo', 'sotillo'));

  // Festival posters
  const poster = { datePrecision: 'year', images: [] };
  await d.doc('festivalPosters/fp1').set({ ...poster, municipalityId: 'm1', title: 'Fiestas de San Roque', year: 2024, status: 'active' });
  await d.doc('festivalPosters/fp2').set({ ...poster, municipalityId: 'm1', title: null, year: 2019, status: 'active' });
  await d.doc('festivalPosters/fp3').set({ ...poster, municipalityId: 'm1', title: 'Cartel retirado', year: 2023, status: 'hidden' });
  await d.doc('festivalPosters/fp4').set({ ...poster, municipalityId: 'm3', title: 'Fiestas de Arcones', year: 2024, status: 'active' });

  // Places and barrios live under their pueblo.
  await d.doc('municipalities/m1/places/p1').set({ name: 'Ermita de la Virgen', kind: 'hermitage', status: 'active', images: [] });
  await d.doc('municipalities/m1/places/p2').set({ name: 'Lugar oculto', kind: 'otros', status: 'hidden', images: [] });
  await d.doc('municipalities/m3/places/p3').set({ name: 'Fuente de Arcones', kind: 'otros', status: 'active', images: [] });
  await d.doc('municipalities/m1/barrios/b1').set({ name: 'Barrio de Arriba', kind: 'barrio', status: 'active', images: [], residentCount: 7 });
  await d.doc('municipalities/m1/barrios/b2').set({ name: 'Barrio fantasma', kind: 'barrio', status: 'hidden', images: [] });
  await d.doc('municipalities/m3/barrios/b3').set({ name: 'Barrio de Arcones', kind: 'barrio', status: 'active', images: [] });

  // Organizations
  const org = { type: 'peña', images: [] };
  await d.doc('organizations/o1').set({ ...org, municipalityId: 'm1', municipalityIds: ['m1'], name: 'Peña El Toro', status: 'approved' });
  await d.doc('organizations/o2').set({ ...org, municipalityId: 'm1', municipalityIds: ['m1'], name: 'Peña Pendiente', status: 'pending' });
  await d.doc('organizations/o3').set({ ...org, municipalityId: 'm3', municipalityIds: ['m3'], name: 'Peña de Arcones', status: 'approved' });
  // From Arcones, and accepted by Matabuena (docs/decisions/multi-village-groups.md).
  await d.doc('organizations/o4').set({
    ...org, type: 'asociación', municipalityId: 'm3', municipalityIds: ['m3', 'm1'], villageSlug: 'arcones', name: 'Banda Comarcal', status: 'approved',
  });

  // History: two centuries, one hidden entry, one of another pueblo.
  const entry = (municipalityId: string, title: string, year: number, status: string) => ({
    municipalityId,
    title,
    start: { year, month: null, day: null },
    end: null,
    approximate: false,
    sortKey: year * 10000,
    status,
    images: [],
    body: null,
    sources: null,
  });
  await d.doc('historyEntries/h1').set(entry('m1', 'Llega el ferrocarril', 1925, 'active'));
  await d.doc('historyEntries/h2').set(entry('m1', 'Se funda la ermita', 1650, 'active'));
  await d.doc('historyEntries/h3').set(entry('m1', 'Entrada retirada', 1930, 'hidden'));
  await d.doc('historyEntries/h4').set(entry('m3', 'Historia de Arcones', 1940, 'active'));

  // Vocabulary
  const term = (municipalityId: string, word: string, status: string) => ({ municipalityId, term: word, normalized: word, kind: 'palabra', status });
  await d.doc('vocabularyTerms/m1__zagal').set(term('m1', 'zagal', 'active'));
  await d.doc('vocabularyTerms/m1__retirada').set(term('m1', 'retirada', 'hidden'));
  await d.doc('vocabularyTerms/m3__arconero').set(term('m3', 'arconero', 'active'));
  const definition = (id: string, termId: string, municipalityId: string, text: string, status: string, iso: string) =>
    d.doc(`vocabularyDefinitions/${id}`).set({ termId, municipalityId, definition: text, example: null, castellano: null, status, createdAt: ts(iso) });
  await definition('d1', 'm1__zagal', 'm1', 'Muchacho joven', 'active', '2026-01-01T00:00:00Z');
  await definition('d2', 'm1__zagal', 'm1', 'Definición retirada', 'hidden', '2026-01-02T00:00:00Z');
  await definition('d3', 'm3__zagal', 'm3', 'Definición de otro pueblo', 'active', '2026-01-03T00:00:00Z');
}

const SECTION_CASES: { section: (typeof PUBLIC_SECTIONS)[number]; shown: string[]; hidden: string[]; empty: string }[] = [
  { section: 'carteles', shown: ['Fiestas de San Roque', 'Cartel de fiestas 2019'], hidden: ['Cartel retirado', 'Fiestas de Arcones'], empty: 'Todavía no hay nada aquí.' },
  { section: 'lugares', shown: ['Ermita de la Virgen'], hidden: ['Lugar oculto', 'Fuente de Arcones'], empty: 'Todavía no hay nada aquí.' },
  { section: 'entidades', shown: ['Peña El Toro', 'Banda Comarcal'], hidden: ['Peña Pendiente', 'Peña de Arcones'], empty: 'Todavía no hay nada aquí.' },
  { section: 'barrios', shown: ['Barrio de Arriba'], hidden: ['Barrio fantasma', 'Barrio de Arcones'], empty: 'Todavía no hay nada aquí.' },
  { section: 'historia', shown: ['Llega el ferrocarril', 'Se funda la ermita'], hidden: ['Entrada retirada', 'Historia de Arcones'], empty: 'Todavía no hay entradas.' },
  { section: 'vocabulario', shown: ['zagal'], hidden: ['retirada', 'arconero'], empty: 'Todavía no hay palabras.' },
];

describe('readSite sections and details', () => {
  beforeEach(async () => {
    await resetEmulators();
    await seed();
  });

  it('covers every public section', () => {
    expect(SECTION_CASES.map((c) => c.section).sort()).toEqual([...PUBLIC_SECTIONS].sort());
  });

  describe.each(SECTION_CASES)('/<pueblo>/$section', ({ section, shown, hidden, empty }) => {
    it("lists the pueblo's public docs only — never a hidden one or another pueblo's", async () => {
      const { status, body } = await html(villageSectionPath('matabuena', section));
      expect(status).toBe(200);
      for (const title of shown) expect(body, title).toContain(title);
      for (const title of hidden) expect(body, title).not.toContain(title);
      expect(body).not.toContain(empty);
    });

    it('says so when the pueblo has nothing yet', async () => {
      const { status, body } = await html(villageSectionPath('sotillo', section));
      expect(status).toBe(200);
      expect(body).toContain(empty);
    });
  });

  it('lists a group from another pueblo under its own pueblo, and its page names the others', async () => {
    const list = await html(villageSectionPath('matabuena', 'entidades'));
    const home = entityPath('organization', { id: 'o4', title: 'Banda Comarcal', villageSlug: 'arcones' });
    expect(list.body).toContain(`href="${home}"`);

    const page = await html(home);
    expect(page.status).toBe(200);
    expect(page.body).toContain('También en <a href="/matabuena">Matabuena</a>');
    // Arcones lists it as its own, too.
    expect((await html(villageSectionPath('arcones', 'entidades'))).body).toContain('Banda Comarcal');
  });

  it('answers a section of an unknown pueblo with a 404', async () => {
    expect((await html('/no-existe/carteles')).status).toBe(404);
  });

  it('groups history by century, newest first', async () => {
    const { body } = await html('/matabuena/historia');
    const xx = body.indexOf('<h2>Siglo XX</h2>');
    const xvii = body.indexOf('<h2>Siglo XVII</h2>');
    expect(xx).toBeGreaterThan(-1);
    expect(xvii).toBeGreaterThan(xx);
    expect(body.indexOf('Llega el ferrocarril')).toBeGreaterThan(xx);
    expect(body.indexOf('Llega el ferrocarril')).toBeLessThan(xvii);
    expect(body.indexOf('Se funda la ermita')).toBeGreaterThan(xvii);
  });

  describe('detail pages', () => {
    const DETAILS = [
      {
        kind: 'cartel',
        path: entityPath('festivalPoster', festivalPosterLinkTarget({ id: 'fp1', title: 'Fiestas de San Roque', year: 2024, villageSlug: 'matabuena' })),
        title: 'Fiestas de San Roque',
        stale: '/matabuena/cartel/titulo-viejo_fp1',
        hidden: entityPath('festivalPoster', { id: 'fp3', title: 'Cartel retirado', ...at('matabuena') }),
      },
      {
        kind: 'acontecimiento',
        path: entityPath('historyEntry', { id: 'h1', title: 'Llega el ferrocarril', ...at('matabuena') }),
        title: 'Llega el ferrocarril',
        stale: '/matabuena/acontecimiento/titulo-viejo_h1',
        hidden: entityPath('historyEntry', { id: 'h3', title: 'Entrada retirada', ...at('matabuena') }),
      },
      {
        kind: 'barrio',
        path: entityPath('barrio', { id: 'b1', title: 'Barrio de Arriba', ...at('matabuena') }),
        title: 'Barrio de Arriba',
        stale: '/matabuena/barrio/titulo-viejo_b1',
        hidden: entityPath('barrio', { id: 'b2', title: 'Barrio fantasma', ...at('matabuena') }),
      },
      {
        kind: 'lugar',
        path: entityPath('place', { id: 'p1', title: 'Ermita de la Virgen', ...at('matabuena') }),
        title: 'Ermita de la Virgen',
        stale: '/matabuena/lugar/titulo-viejo_p1',
        hidden: entityPath('place', { id: 'p2', title: 'Lugar oculto', ...at('matabuena') }),
      },
    ];

    describe.each(DETAILS)('/<pueblo>/$kind/', ({ path, title, stale, hidden }) => {
      it('renders the canonical URL', async () => {
        const { status, body } = await html(path);
        expect(status).toBe(200);
        expect(body).toContain(`<h1>${title}</h1>`);
      });

      it('redirects a stale slug to the canonical URL, permanently', async () => {
        expect(await get(stale)).toEqual({ kind: 'redirect', location: path, permanent: true });
      });

      it('answers a hidden doc with a 404', async () => {
        expect((await html(hidden)).status).toBe(404);
      });
    });

    it('titles an untitled cartel by its year', async () => {
      const path = entityPath('festivalPoster', festivalPosterLinkTarget({ id: 'fp2', title: null, year: 2019, villageSlug: 'matabuena' }));
      const { status, body } = await html(path);
      expect(status).toBe(200);
      expect(body).toContain('<h1>Cartel de fiestas 2019</h1>');
    });

    it("sends a top-level doc asked for under the wrong pueblo to its own pueblo's URL", async () => {
      const wanted = entityPath('festivalPoster', festivalPosterLinkTarget({ id: 'fp4', title: 'Fiestas de Arcones', year: 2024, villageSlug: 'arcones' }));
      expect(await get('/matabuena/cartel/fiestas-de-arcones_fp4')).toEqual({ kind: 'redirect', location: wanted, permanent: true });
    });

    it("never finds a place or barrio of another pueblo under this one's URL", async () => {
      expect((await html(entityPath('place', { id: 'p3', title: 'Fuente de Arcones', ...at('matabuena') }))).status).toBe(404);
      expect((await html(entityPath('barrio', { id: 'b3', title: 'Barrio de Arcones', ...at('matabuena') }))).status).toBe(404);
    });

    it('shows a word with its active definitions only', async () => {
      const { status, body } = await html('/matabuena/palabra/zagal');
      expect(status).toBe(200);
      expect(body).toContain('Muchacho joven');
      expect(body).not.toContain('Definición retirada');
      expect(body).not.toContain('Definición de otro pueblo');
    });

    it('answers a hidden word, or a word of another pueblo, with a 404', async () => {
      expect((await html('/matabuena/palabra/retirada')).status).toBe(404);
      expect((await html('/matabuena/palabra/arconero')).status).toBe(404);
    });
  });
});
