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

  it('lists the home and the /pueblos directory', async () => {
    const xml = await fetchSitemap();
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/<\/loc>/);
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+\/pueblos<\/loc>/);
  });
});
