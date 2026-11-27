import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { GOOGLE_MAPS_API_KEY } from './secret';
import { buildGeocodeUrl, mapGeocodeResponse, type GeocodePlace } from './geocode';
import { defineCallable } from '../shared/define/defineCallable';

const handler = 'geocodeSearch';

/** Core logic, separated from the onCall envelope so it is unit-testable. */
export async function runGeocodeSearch(query: unknown): Promise<GeocodePlace[]> {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new HttpsError('invalid-argument', 'query requerido.');
  }
  const resp = await fetch(buildGeocodeUrl(query.trim(), GOOGLE_MAPS_API_KEY.value()));
  if (!resp.ok) {
    logger.error('geocodeSearch upstream error', { handler, status: resp.status });
    return [];
  }
  const results = mapGeocodeResponse(await resp.json());
  logger.info('geocode search', { handler, count: results.length });
  return results;
}

interface GeocodeSearchData {
  query?: string;
}

export const geocodeSearch = defineCallable<GeocodeSearchData, Promise<{ results: GeocodePlace[] }>>(
  'geocodeSearch',
  { cors: true, secrets: [GOOGLE_MAPS_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const results = await runGeocodeSearch((request.data as GeocodeSearchData | undefined)?.query);
    return { results };
  },
);
