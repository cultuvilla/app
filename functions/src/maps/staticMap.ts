import { logger } from 'firebase-functions/v2';
import { GOOGLE_MAPS_API_KEY } from './secret';
import { buildStaticMapUrl, parseStaticMapQuery } from './staticMapUrl';
import { defineHttpFunction } from '../shared/define/defineHttpFunction';

/**
 * Proxies Google Static Maps so the API key never reaches the client.
 * Loaded directly as an <Image> source. Long Cache-Control: a pueblo's
 * coordinates rarely change and the tile for a coord is immutable.
 */
export const staticMap = defineHttpFunction(
  'staticMap',
  { region: 'europe-west1', cors: true, secrets: [GOOGLE_MAPS_API_KEY], memory: '256MiB', maxInstances: 10 },
  async (req, res) => {
    const handler = 'staticMap';
    let params;
    try {
      params = parseStaticMapQuery(req.query);
    } catch (err) {
      logger.info('staticMap bad request', { handler, err: err instanceof Error ? err.message : String(err) });
      res.status(400).set('Content-Type', 'text/plain').send('Bad Request');
      return;
    }
    try {
      const upstream = await fetch(buildStaticMapUrl(params, GOOGLE_MAPS_API_KEY.value()));
      if (!upstream.ok) {
        logger.error('staticMap upstream error', { handler, status: upstream.status });
        res.status(502).set('Content-Type', 'text/plain').send('Bad Gateway');
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res
        .status(200)
        .set('Content-Type', upstream.headers.get('content-type') ?? 'image/png')
        .set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
        .send(buf);
    } catch (err) {
      logger.error('staticMap failed', { handler, err: err instanceof Error ? err.message : String(err) });
      res.status(500).set('Content-Type', 'text/plain').send('Internal Server Error');
    }
  },
);
