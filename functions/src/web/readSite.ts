import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { webOriginForProject } from '@cultuvilla/shared/utils';
import { renderDocument } from './document';
import { handle } from './handler';

/**
 * The public web: a server-rendered, read-only Cultuvilla for the anonymous
 * reader — the WhatsApp link recipient and Google
 * (docs/decisions/web-is-a-read-site.md). Every action hands over to the app.
 *
 * Cache-Control: 10 min in the browser, 1 hour at the Hosting edge, so a busy
 * share link costs one render an hour, not one per visitor.
 */
export function cacheControlFor(status: number, deviceDependent: boolean): string {
  if (deviceDependent) return 'private, no-store';
  return status === 200 ? 'public, max-age=600, s-maxage=3600' : 'public, max-age=60, s-maxage=300';
}

export const readSite = onRequest(
  { region: 'europe-west1', cors: false, maxInstances: 20, memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    const url = new URL(req.originalUrl, 'https://localhost');
    try {
      const out = await handle(
        { pathname: url.pathname, userAgent: req.get('user-agent') ?? null },
        { db: getFirestore(), bucket: getStorage().bucket().name, now: new Date() },
      );
      if (out.kind === 'redirect') {
        res
          .status(out.permanent ? 301 : 302)
          .set('Location', out.permanent ? `${out.location}${url.search}` : out.location)
          // The store hand-off depends on the visitor's device; never share it at the edge.
          .set('Cache-Control', out.permanent ? 'public, max-age=600, s-maxage=3600' : 'private, no-store')
          .send('');
        return;
      }
      const status = out.page.status ?? 200;
      // Canonical names the project's public origin, never the host this request
      // arrived on — prod answers on two hosts and each would claim the page.
      const canonical = `${webOriginForProject(process.env['GCLOUD_PROJECT'])}${out.path}`;
      res
        .status(status)
        .set('Content-Type', 'text/html; charset=utf-8')
        // A 404 caches briefly: the doc may exist a minute from now. A device-dependent
        // page never caches at the edge: Hosting ignores Vary: User-Agent, so a desktop's
        // /descarga picker would be served to the next phone that scans the printed QR.
        .set('Cache-Control', cacheControlFor(status, out.deviceDependent === true))
        .send(renderDocument(out.page, { canonical, appPath: out.path }));
    } catch (err) {
      logger.error('readSite failed', {
        handler: 'readSite',
        path: url.pathname,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      res.status(500).set('Content-Type', 'text/plain; charset=utf-8').set('Cache-Control', 'no-store').send('Error interno');
    }
  },
);
