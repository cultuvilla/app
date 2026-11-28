import { EventEmitter } from 'node:events';
import { describe, it, expect, beforeEach } from 'vitest';
import * as admin from 'firebase-admin';
import { resetEmulators } from '../../helpers/firestoreEmulator';
import { sitemap } from '../../../seo/sitemap';

async function fetchSitemap(): Promise<string> {
  let body = '';
  // v2 onRequest handlers listen on req/res, so both must be emitters.
  const res: EventEmitter = Object.assign(new EventEmitter(), {
    status: (): EventEmitter => res,
    set: (): EventEmitter => res,
    send: (b: string): EventEmitter => {
      body = b;
      return res;
    },
  });
  const req = Object.assign(new EventEmitter(), { get: () => undefined, originalUrl: '/sitemap.xml' });
  await (sitemap as unknown as (req: unknown, res: unknown) => Promise<void>)(req, res);
  return body;
}

describe('sitemap', () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  it('lists active news and leaves hidden posts out', async () => {
    const publishedAt = admin.firestore.Timestamp.fromDate(new Date('2026-07-20T10:00:00Z'));
    await admin.firestore().doc('news/n1').set({ title: 'Visible', villageSlug: 'matabuena', status: 'active', publishedAt });
    await admin.firestore().doc('news/n2').set({ title: 'Oculta', villageSlug: 'matabuena', status: 'hidden', publishedAt });
    const xml = await fetchSitemap();
    expect(xml).toContain('/matabuena/noticia/visible_n1');
    expect(xml).not.toContain('_n2');
  });

  it('lists public published and completed events, and leaves out private, past-tail, draft and cancelled ones', async () => {
    const db = admin.firestore();
    const at = (daysAgo: number) => admin.firestore.Timestamp.fromDate(new Date(Date.now() - daysAgo * 86_400_000));
    const base = { villageSlug: 'matabuena', visibility: 'public', visibilityOrgId: null, endBoundary: at(1) };
    await db.doc('events/e1').set({ ...base, title: 'Verbena', status: 'published' });
    await db.doc('events/e2').set({ ...base, title: 'Cena secreta', status: 'published', visibility: 'organization', visibilityOrgId: 'o1' });
    // A shape the rules refuse: the pointer still makes it private.
    await db.doc('events/e3').set({ ...base, title: 'Cena oculta', status: 'published', visibilityOrgId: 'o1' });
    await db.doc('events/e4').set({ ...base, title: 'Fiestas de antaño', status: 'published', endBoundary: at(400) });
    await db.doc('events/e5').set({ ...base, title: 'Borrador', status: 'draft' });
    await db.doc('events/e6').set({ ...base, title: 'Merienda', status: 'cancelled' });
    // Ended inside the tail: `completeExpiredEvents` has already flipped it.
    await db.doc('events/e7').set({ ...base, title: 'Romería', status: 'completed', endBoundary: at(30) });
    await db.doc('events/e8').set({ ...base, title: 'Fiestas viejas', status: 'completed', endBoundary: at(400) });
    await db.doc('events/e9').set({ ...base, title: 'Cena cerrada', status: 'completed', visibility: 'organization', visibilityOrgId: 'o1' });
    const xml = await fetchSitemap();
    expect(xml).toContain('/matabuena/evento/verbena_e1');
    expect(xml).toContain('/matabuena/evento/romeria_e7');
    for (const id of ['e2', 'e3', 'e4', 'e5', 'e6', 'e8', 'e9']) expect(xml).not.toContain(`_${id}<`);
    expect(xml).not.toMatch(/secreta|oculta|cerrada/i);
  });

  it('lists approved organizations only', async () => {
    const createdAt = admin.firestore.Timestamp.now();
    await admin.firestore().doc('organizations/o1').set({ name: 'La Peña', villageSlug: 'matabuena', status: 'approved', createdAt });
    await admin.firestore().doc('organizations/o2').set({ name: 'Pendiente', villageSlug: 'matabuena', status: 'pending', createdAt });
    const xml = await fetchSitemap();
    expect(xml).toContain('_o1<');
    expect(xml).not.toContain('_o2<');
  });

  it('lists the home, the /pueblos directory and the /embajadores page', async () => {
    const xml = await fetchSitemap();
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/pueblos<\/loc>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/embajadores<\/loc>/);
  });
});
