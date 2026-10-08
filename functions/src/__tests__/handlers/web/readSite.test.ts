// The read site against the Firestore emulator: seeds real-shaped docs and
// checks what an anonymous visitor gets — above all, what they must NOT get.

import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { APP_STORES } from '@cultuvilla/shared/config';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { handle, type WebResponse } from '../../../web/handler';
import { renderDocument } from '../../../web/document';

const db = () => admin.firestore();
const NOW = new Date('2026-08-01T10:00:00Z');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';

async function get(pathname: string, userAgent: string | null = null): Promise<WebResponse> {
  return handle({ pathname, userAgent }, { db: db(), bucket: 'test-bucket', now: NOW });
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

async function seed(): Promise<void> {
  const d = db();
  await d.doc('municipalities/m1').set({
    name: 'Matabuena',
    slug: 'matabuena',
    province: 'Segovia',
    communityActive: true,
    escudoUrl: null,
    escudoManualUrl: null,
    community: { description: 'Pueblo de la sierra.' },
  });
  await d.doc('municipalities/m2').set({ name: 'Vacío', slug: 'vacio', province: 'Soria', communityActive: false });
  const event = {
    municipalityId: 'm1',
    startDate: ts('2026-08-15T18:00:00Z'),
    endDate: ts('2026-08-15T22:00:00Z'),
    location: { displayName: 'Plaza Mayor' },
    visibility: 'public',
    visibilityOrgId: null,
  };
  await d.doc('events/e1').set({ ...event, title: 'Verbena', description: 'Música y baile', status: 'published' });
  await d.doc('events/e2').set({ ...event, title: 'Cena de la peña', status: 'published', visibility: 'private', visibilityOrgId: 'o1' });
  await d.doc('events/e3').set({ ...event, title: 'Borrador secreto', status: 'draft' });
  const byPena = { ...event, organizerOrgIds: ['o1'] };
  await d.doc('events/e4').set({ ...byPena, title: 'Comida de la peña', status: 'completed', startDate: ts('2026-06-20T14:00:00Z'), endDate: null });
  await d.doc('events/e5').set({ ...byPena, title: 'Merienda suspendida', status: 'cancelled' });
  await d.doc('events/e6').set({ ...byPena, title: 'Cena privada', status: 'published', visibility: 'organization', visibilityOrgId: 'o1' });
  await d.doc('events/e7').set({ ...byPena, title: 'Excursión de otoño', status: 'published', startDate: ts('2026-10-10T08:00:00Z'), endDate: null });
  await d.doc('news/n1').set({
    municipalityId: 'm1',
    title: 'Programa de fiestas',
    status: 'active',
    publishedAt: ts('2026-07-20T10:00:00Z'),
    content: [
      {
        type: 'text',
        style: 'paragraph',
        text: 'Organiza la Peña El Toro',
        mentions: [{ entityType: 'organization', entityId: 'o1', label: 'Peña El Toro', offset: 12, length: 12 }],
        links: [],
        marks: [],
      },
    ],
  });
  await d.doc('news/n2').set({ municipalityId: 'm1', title: 'Oculta', status: 'hidden', publishedAt: ts('2026-07-21T10:00:00Z'), content: [] });
  await d.doc('organizations/o1').set({ municipalityId: 'm1', name: 'Peña El Toro', status: 'approved', type: 'peña', images: [], memberCount: 12 });
  await d.doc('organizations/o2').set({ municipalityId: 'm1', name: 'Peña Pendiente', status: 'pending', type: 'peña', images: [] });
  await d.doc('municipalities/m1/places/p1').set({ name: 'Ermita', kind: 'hermitage', status: 'active', images: [] });
  await d.doc('municipalities/m1/places/p2').set({ name: 'Lugar oculto', kind: 'otros', status: 'hidden', images: [] });
  await d.doc('vocabularyTerms/m1__zagal').set({ municipalityId: 'm1', term: 'zagal', normalized: 'zagal', kind: 'palabra', status: 'active' });
  await d.doc('vocabularyDefinitions/d1').set({
    termId: 'm1__zagal',
    municipalityId: 'm1',
    definition: 'Muchacho joven',
    example: null,
    castellano: 'chico',
    status: 'active',
    createdAt: ts('2026-01-01T00:00:00Z'),
  });
  const wrapped = {
    municipalityId: 'm1',
    villageName: 'Matabuena',
    stats: { eventCount: 14, uniquePersonCount: 230 },
    images: { stats: 'https://img.test/stats.png', cover: 'https://img.test/cover.png' },
  };
  await d.doc('villageWrapped/m1_2026').set({ ...wrapped, year: 2026, status: 'published' });
  await d.doc('villageWrapped/m1_2025').set({ ...wrapped, year: 2025, status: 'draft' });
}

describe('readSite', () => {
  beforeEach(async () => {
    await resetEmulators();
    await seed();
  });

  it('renders an active village with its public content only', async () => {
    const { status, body } = await html('/matabuena');
    expect(status).toBe(200);
    expect(body).toContain('<h1>Matabuena</h1>');
    expect(body).toContain('Verbena');
    expect(body).toContain('Programa de fiestas');
    expect(body).toContain('Peña El Toro');
    expect(body).toContain('Ermita');
    for (const hidden of ['Cena de la peña', 'Borrador secreto', 'Oculta', 'Peña Pendiente', 'Lugar oculto']) {
      expect(body).not.toContain(hidden);
    }
    expect(body).not.toContain('noindex');
  });

  it("shows Matabuena's published fiestas summary on the landing, card by card", async () => {
    const { status, body } = await html('/');
    expect(status).toBe(200);
    expect(body).toContain('class="wr-track"');
    expect(body).toContain('src="https://img.test/cover.png"');
    expect(body).toContain('Fiestas 2026 · Matabuena');
    expect(body).toContain('href="/pueblos"');
  });

  it("falls back to last year's summary until this year's is published, and never shows a draft", async () => {
    const at = async (iso: string) => {
      const out = await handle({ pathname: '/', userAgent: null }, { db: db(), bucket: 'test-bucket', now: new Date(iso) });
      if (out.kind !== 'page') throw new Error('expected a page');
      return renderDocument(out.page, { canonical: 'https://x/', appPath: '/' });
    };
    expect(await at('2027-03-01T10:00:00Z')).toContain('Fiestas 2026 · Matabuena');
    // 2026 itself has no summary in this probe: only the 2025 draft is left.
    await db().doc('villageWrapped/m1_2026').delete();
    expect(await at('2026-08-01T10:00:00Z')).not.toContain('class="wr-track"');
  });

  it('features Matabuena on /pueblos, with its real content and every active pueblo', async () => {
    await db().doc('municipalities/m3').set({ name: 'Arcones', slug: 'arcones', province: 'Segovia', communityActive: true });
    const { status, body } = await html('/pueblos');
    expect(status).toBe(200);
    expect(body).toContain('Así se vive Matabuena en Cultuvilla');
    expect(body).toContain('Verbena');
    expect(body).toContain('Peña El Toro');
    expect(body).not.toContain('Cena de la peña');
    expect(body).toContain('2 pueblos y contando');
    expect(body).not.toContain('href="/vacio"');
  });

  it('lists every active pueblo on /pueblos, past any page-size cap', async () => {
    const batch = db().batch();
    for (let i = 0; i < 70; i++) {
      const n = String(i).padStart(2, '0');
      batch.set(db().doc(`municipalities/bulk${n}`), { name: `Pueblo ${n}`, slug: `pueblo-${n}`, province: 'Soria', communityActive: true });
    }
    await batch.commit();
    const { body } = await html('/pueblos');
    expect(body).toContain('71 pueblos y contando');
    expect(body).toContain('href="/pueblo-00"');
    expect(body).toContain('href="/pueblo-69"');
  });

  it('features the first active pueblo by name when Matabuena is not active', async () => {
    await db().doc('municipalities/m1').update({ communityActive: false });
    await db().doc('municipalities/m3').set({ name: 'Arcones', slug: 'arcones', province: 'Segovia', communityActive: true });
    await db().doc('events/e9').set({
      municipalityId: 'm3',
      title: 'Romería de Arcones',
      startDate: ts('2026-09-08T10:00:00Z'),
      endDate: null,
      visibility: 'public',
      visibilityOrgId: null,
      status: 'published',
    });
    const { body } = await html('/pueblos');
    expect(body).toContain('Así se vive Arcones en Cultuvilla');
    expect(body).toContain('Romería de Arcones');
    expect(body).not.toContain('Así se vive Matabuena');
  });

  it('keeps a village without a community out of the index', async () => {
    const { body } = await html('/vacio');
    expect(body).toContain('noindex');
    expect(body).toContain('aún no está en Cultuvilla');
  });

  it('renders an event and redirects a stale slug to its one canonical URL', async () => {
    const { body } = await html('/matabuena/evento/verbena_e1');
    expect(body).toContain('<h1>Verbena</h1>');
    expect(body).toContain('Plaza Mayor');
    expect(body).toContain('"@type":"Event"');
    expect(await get('/otro-pueblo/evento/titulo-viejo_e1')).toEqual({
      kind: 'redirect',
      location: '/matabuena/evento/verbena_e1',
      permanent: true,
    });
  });

  it('withholds a private event and never leaks its title, even in the URL', async () => {
    expect(await get('/matabuena/evento/cena-de-la-pena_e2')).toMatchObject({
      kind: 'redirect',
      location: '/matabuena/evento/evento-privado_e2',
    });
    const { body } = await html('/matabuena/evento/evento-privado_e2');
    expect(body).toContain('Evento privado');
    expect(body).toContain('noindex');
    expect(body).not.toContain('Cena de la peña');
  });

  it('does not render drafts, hidden news, pending orgs or hidden places', async () => {
    for (const path of [
      '/matabuena/evento/borrador_e3',
      '/matabuena/noticia/oculta_n2',
      '/matabuena/entidad/pena-pendiente_o2',
      '/matabuena/lugar/lugar-oculto_p2',
      '/no-existe',
    ]) {
      expect((await html(path)).status, path).toBe(404);
    }
  });

  it('renders news blocks with mentions linked to the mentioned page', async () => {
    const { body } = await html('/matabuena/noticia/programa-de-fiestas_n1');
    expect(body).toContain('<a href="/matabuena/entidad/pena-el-toro_o1">Peña El Toro</a>');
  });

  it("lists an org's public events, never its cancelled or private ones", async () => {
    const { body } = await html('/matabuena/entidad/pena-el-toro_o1');
    expect(body).toContain('<h2>Eventos</h2>');
    expect(body).toContain('Comida de la peña');
    // Upcoming first, then past — the app's order, not start order.
    expect(body.indexOf('Excursión de otoño')).toBeLessThan(body.indexOf('Comida de la peña'));
    for (const hidden of ['Merienda suspendida', 'Cena privada', 'Verbena']) {
      expect(body).not.toContain(hidden);
    }
  });

  it('keeps an org invite out of the index', async () => {
    const { body } = await html('/matabuena/entidad/pena-el-toro_o1/unirse');
    expect(body).toContain('Te han invitado');
    expect(body).toContain('noindex');
  });

  it('renders a word with its definitions', async () => {
    const { body } = await html('/matabuena/palabra/zagal');
    expect(body).toContain('<h1>zagal</h1>');
    expect(body).toContain('Muchacho joven');
    expect(body).toContain('En castellano: chico');
  });

  it('sends a phone on /descarga straight to its store, and shows a desktop the picker', async () => {
    expect(await get('/descarga', IPHONE)).toEqual({ kind: 'redirect', location: APP_STORES.ios, permanent: false });
    const { body } = await html('/descarga');
    expect(body).toContain(APP_STORES.android);
    // The desktop picker must not be cached at the edge, or the next phone gets it.
    expect(await get('/descarga', null)).toMatchObject({ kind: 'page', deviceDependent: true });
    expect(await get('/matabuena', null)).not.toHaveProperty('deviceDependent');
  });

  it('renders a published Wrapped as its cards, cover first', async () => {
    const { status, body } = await html('/matabuena/fiestas/2026');
    expect(status).toBe(200);
    expect(body).toContain('Fiestas 2026');
    expect(body).toContain('14 eventos');
    expect(body.indexOf('cover.png')).toBeLessThan(body.indexOf('stats.png'));
    expect(body).toContain('data-app-path="/matabuena/fiestas/2026"');
  });

  // A draft is the village admins' to release; its link shows nothing before they do.
  it('answers a draft Wrapped, or a year without one, with a 404', async () => {
    for (const path of ['/matabuena/fiestas/2025', '/matabuena/fiestas/2019', '/no-existe/fiestas/2026']) {
      const { status, body } = await html(path);
      expect(status, path).toBe(404);
      expect(body).not.toContain('cover.png');
    }
  });

  it('answers app-only screens with an app hand-off, not a 404', async () => {
    const { status, body } = await html('/ajustes');
    expect(status).toBe(200);
    expect(body).toContain('noindex');
    expect(body).toContain('Esto está en la app');
  });
});

describe('readSite — the /embajadores form', () => {
  const post = (body: Record<string, string>, ip = '203.0.113.7', now = NOW) =>
    handle({ pathname: '/embajadores', userAgent: null, method: 'POST', body, ip }, { db: db(), bucket: 'test-bucket', now });
  const form = { pueblo: 'Matabuena (Segovia)', municipalityId: 'm9', nombre: 'Ana', telefono: '612 345 678', consentimiento: 'si', web: '' };
  const leads = async () => (await db().collection('ambassadorLeads').get()).docs.map((d) => d.data());

  beforeEach(async () => {
    await resetEmulators();
    await db().doc('municipalities/m9').set({
      name: 'Matabuena',
      nameLower: 'matabuena',
      province: 'Segovia',
      searchPrefixes: ['ma', 'mat', 'mata', 'matab', 'mataba', 'matabu', 'matabue', 'matabuen', 'matabuena'],
    });
    await db().doc('municipalities/m8').set({
      name: 'Matamala de Almazán',
      nameLower: 'matamala de almazan',
      province: 'Soria',
      searchPrefixes: ['ma', 'mat', 'mata', 'matam', 'matamala', 'al', 'almazan'],
    });
  });

  it('stores a lead with the chosen pueblo and a normalised phone, then sends the visitor to the thanks page', async () => {
    const out = await post(form);
    expect(out).toEqual({ kind: 'redirect', location: '/embajadores/gracias', permanent: false, seeOther: true });
    const stored = await leads();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ municipalityId: 'm9', municipalityName: 'Matabuena (Segovia)', name: 'Ana', phone: '+34612345678', status: 'new' });
    expect(JSON.stringify(stored[0])).not.toContain('203.0.113.7');
    expect(Object.keys(stored[0]).sort()).toEqual(['createdAt', 'municipalityId', 'municipalityName', 'name', 'phone', 'status']);
  });

  it('finds the pueblo from what was typed when the picker never ran, and keeps the typed name when nothing matches', async () => {
    await post({ ...form, municipalityId: '', pueblo: 'matabuena' });
    await post({ ...form, municipalityId: '', pueblo: 'Villaperdida' }, '198.51.100.1');
    const stored = await leads();
    expect(stored.map((l) => [l['municipalityId'], l['municipalityName']]).sort()).toEqual([
      [null, 'Villaperdida'],
      ['m9', 'Matabuena (Segovia)'],
    ]);
  });

  it('hands an incomplete form back, uncached, and stores nothing', async () => {
    const out = await post({ ...form, telefono: '123', consentimiento: '' });
    expect(out.kind).toBe('page');
    if (out.kind !== 'page') return;
    expect(out.page.status).toBe(400);
    expect(out.deviceDependent).toBe(true);
    const body = renderDocument(out.page, { canonical: 'https://x/embajadores', appPath: '/embajadores' });
    expect(body).toContain('Escribe un teléfono válido');
    expect(body).toContain('Necesitamos tu permiso');
    expect(body).toContain('value="Ana"');
    expect(await leads()).toHaveLength(0);
  });

  it('tells a bot that filled the hidden field it worked, and stores nothing', async () => {
    const out = await post({ ...form, web: 'http://spam.example' });
    expect(out.kind).toBe('redirect');
    expect(await leads()).toHaveLength(0);
  });

  it('stops one network after a day’s worth of requests, and lets it back the next day', async () => {
    for (let i = 0; i < 5; i++) expect((await post(form)).kind).toBe('redirect');
    const sixth = await post(form);
    expect(sixth.kind).toBe('page');
    if (sixth.kind === 'page') expect(renderDocument(sixth.page, { canonical: 'https://x', appPath: '/' })).toContain('cultuvilla.app@gmail.com');
    expect((await post(form, '198.51.100.1')).kind).toBe('redirect');
    expect((await post(form, '203.0.113.7', new Date(NOW.getTime() + 25 * 3600 * 1000))).kind).toBe('redirect');
    expect(await leads()).toHaveLength(7);
  });

  it('holds the cap when one network submits many times at once', async () => {
    const outcomes = await Promise.all(Array.from({ length: 9 }, () => post(form)));
    expect(outcomes.filter((o) => o.kind === 'redirect')).toHaveLength(5);
    expect(await leads()).toHaveLength(5);
  });

  it('answers the picker with matching pueblos, by any word of their name', async () => {
    const search = (q: string) => handle({ pathname: '/embajadores/pueblos', userAgent: null, q }, { db: db(), bucket: 'test-bucket', now: NOW });
    expect(await search('mata')).toEqual({
      kind: 'json',
      maxAge: 86400,
      body: [
        { id: 'm9', name: 'Matabuena', province: 'Segovia' },
        { id: 'm8', name: 'Matamala de Almazán', province: 'Soria' },
      ],
    });
    expect(await search('Almazán')).toMatchObject({ body: [{ id: 'm8' }] });
    expect(await search('m')).toMatchObject({ body: [] });
  });

  it('takes a POST only on /embajadores', async () => {
    const out = await handle({ pathname: '/pueblos', userAgent: null, method: 'POST', body: form, ip: '1.2.3.4' }, { db: db(), bucket: 'test-bucket', now: NOW });
    expect(out).toEqual({ kind: 'methodNotAllowed', allow: 'GET, HEAD' });
    expect(await leads()).toHaveLength(0);
  });
});
