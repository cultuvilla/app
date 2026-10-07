import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { entityPath, villagePath, webOriginForProject } from '@cultuvilla/shared/utils';
import { buildSitemapXml, toLastmod, toDate, type SitemapUrl } from './urls';

/**
 * Why a sitemap at all, and why a function rather than a build artifact.
 *
 * The web build is a client-rendered SPA: a crawler landing on `/` gets an
 * empty `#root` and no anchors to follow, so URL *discovery* — not rendering —
 * is the binding constraint on whether a village ever appears in Google. A
 * sitemap is the only thing that hands Googlebot the list directly.
 *
 * It is generated per request because the content is live Firestore data: a
 * village activated this morning should be crawlable this afternoon, and a
 * build-time file would be stale from the moment it deployed. Edge caching
 * (below) keeps the read volume to a handful of queries per hour.
 *
 * Deliberately no composite indexes: every query here is a single-field order
 * plus a limit, filtered in memory. A sitemap is not worth adding an index
 * (and the deploy gate that comes with one) to firestore.indexes.json.
 */

const MAX_PER_COLLECTION = 1000;

/** Past events keep ranking for a while ("fiestas de Matabuena 2026"), but not forever. */
const EVENT_TAIL_DAYS = 120;

function stringField(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

interface Fetched {
  urls: SitemapUrl[];
  counts: Record<string, number>;
}

async function collectUrls(origin: string): Promise<Fetched> {
  const db = getFirestore();
  const urls: SitemapUrl[] = [
    { loc: `${origin}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${origin}/pueblos`, changefreq: 'daily', priority: '0.9' },
  ];
  const counts: Record<string, number> = {};

  // typed-refs: allowed — intentional converter-less read. A sitemap must not
  // fail because one doc has a stale schema; a strict converter would throw.
  const villages = await db
    .collection('municipalities')
    .where('communityActive', '==', true)
    .limit(MAX_PER_COLLECTION)
    .get();
  for (const doc of villages.docs) {
    const slug = stringField(doc.get('slug'));
    if (!slug) continue;
    urls.push({
      loc: `${origin}${villagePath(slug)}`,
      lastmod: toLastmod(doc.get('updatedAt')),
      changefreq: 'weekly',
      priority: '0.9',
    });
  }
  counts['villages'] = villages.size;

  const cutoff = new Date(Date.now() - EVENT_TAIL_DAYS * 24 * 60 * 60 * 1000);
  const events = await db
    .collection('events')
    .orderBy('endBoundary', 'desc')
    .limit(MAX_PER_COLLECTION)
    .get();
  let eventCount = 0;
  for (const doc of events.docs) {
    // Private events are noindex'd by the renderer; listing them would only
    // spend crawl budget to reach a page that refuses to say anything.
    if (doc.get('visibilityOrgId')) continue;
    if (doc.get('status') !== 'published') continue;
    const boundary = toDate(doc.get('endBoundary'));
    if (boundary && boundary < cutoff) continue;
    const villageSlug = stringField(doc.get('villageSlug'));
    if (!villageSlug) continue;
    urls.push({
      loc: `${origin}${entityPath('event', { id: doc.id, title: stringField(doc.get('title')) ?? '', villageSlug })}`,
      lastmod: toLastmod(doc.get('updatedAt')),
      changefreq: 'weekly',
      priority: '0.8',
    });
    eventCount += 1;
  }
  counts['events'] = eventCount;

  const news = await db
    .collection('news')
    .orderBy('publishedAt', 'desc')
    .limit(MAX_PER_COLLECTION)
    .get();
  let newsCount = 0;
  for (const doc of news.docs) {
    // Hidden posts stay readable to members, and the read site 404s them.
    if (doc.get('status') !== 'active') continue;
    const villageSlug = stringField(doc.get('villageSlug'));
    if (!villageSlug) continue;
    newsCount += 1;
    urls.push({
      loc: `${origin}${entityPath('news', { id: doc.id, title: stringField(doc.get('title')) ?? '', villageSlug })}`,
      lastmod: toLastmod(doc.get('publishedAt')),
      changefreq: 'monthly',
      priority: '0.6',
    });
  }
  counts['news'] = newsCount;

  const orgs = await db
    .collection('organizations')
    .orderBy('createdAt', 'desc')
    .limit(MAX_PER_COLLECTION)
    .get();
  let orgCount = 0;
  for (const doc of orgs.docs) {
    if (doc.get('status') !== 'approved') continue;
    const villageSlug = stringField(doc.get('villageSlug'));
    if (!villageSlug) continue;
    const path = entityPath('organization', {
      id: doc.id,
      title: stringField(doc.get('name')) ?? '',
      villageSlug,
    });
    urls.push({ loc: `${origin}${path}`, changefreq: 'monthly', priority: '0.6' });
    orgCount += 1;
  }
  counts['orgs'] = orgCount;

  return { urls, counts };
}

export const sitemap = onRequest(
  { region: 'europe-west1', cors: false, maxInstances: 3, memory: '256MiB', timeoutSeconds: 60 },
  async (_req, res) => {
    try {
      // Every <loc> names the project's public origin, never the request host:
      // Hosting hands us a Cloud Run host, and prod answers on two domains.
      const origin = webOriginForProject(process.env['GCLOUD_PROJECT']);
      const { urls, counts } = await collectUrls(origin);
      logger.info('Rendered sitemap', { handler: 'sitemap', origin, total: urls.length, ...counts });
      res
        .status(200)
        .set('Content-Type', 'application/xml; charset=utf-8')
        // An hour at the edge: new content is discoverable the same day without
        // re-running four collection scans for every crawler hit.
        .set('Cache-Control', 'public, max-age=600, s-maxage=3600')
        .send(buildSitemapXml(urls));
    } catch (err) {
      logger.error('sitemap failed', {
        handler: 'sitemap',
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).set('Content-Type', 'text/plain').send('Internal Server Error');
    }
  },
);
