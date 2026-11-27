import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { GOOGLE_MAPS_API_KEY } from './secret';
import { buildReverseGeocodeUrl, mapGeocodeResponse } from './geocode';
import { defineCallable } from '../shared/define/defineCallable';

const handler = 'reverseGeocode';

/** Core logic, separated from the onCall envelope so it is unit-testable. */
export async function runReverseGeocode(lat: unknown, lng: unknown): Promise<string | null> {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpsError('invalid-argument', 'lat/lng requeridos.');
  }
  const resp = await fetch(buildReverseGeocodeUrl(lat, lng, GOOGLE_MAPS_API_KEY.value()));
  if (!resp.ok) {
    logger.error('reverseGeocode upstream error', { handler, status: resp.status });
    return null;
  }
  // Google orders results most-specific first, so the head is the street-level
  // name we want rather than "España".
  const results = mapGeocodeResponse(await resp.json());
  const label = results.length > 0 ? results[0].label : null;
  logger.info('reverse geocode', { handler, found: label !== null });
  return label;
}

interface ReverseGeocodeData {
  lat?: number;
  lng?: number;
}

export const reverseGeocode = defineCallable<ReverseGeocodeData, Promise<{ label: string | null }>>(
  'reverseGeocode',
  { cors: true, secrets: [GOOGLE_MAPS_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
    const data = request.data as ReverseGeocodeData | undefined;
    return { label: await runReverseGeocode(data?.lat, data?.lng) };
  },
);
