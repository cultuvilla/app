import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseApp, getFirebaseFunctions } from '../firebase';

export interface GeocodePlace {
  label: string;
  lat: number;
  lng: number;
}

// staticMap is deployed to europe-west1 (see functions/src/maps/staticMap.ts).
const STATIC_MAP_REGION = 'europe-west1';

/** Village location-map zoom bounds, default, and step (Google Static Maps zoom). */
export const MAP_ZOOM_MIN = 11;
export const MAP_ZOOM_MAX = 16;
export const MAP_ZOOM_DEFAULT = 13;
/**
 * Zoom step. Google Static Maps only renders integer zoom levels — a fractional
 * `zoom` (e.g. 13.5) is rejected and falls back to a zoomed-out world map, so
 * the scale is integers only.
 */
export const MAP_ZOOM_STEP = 1;

/**
 * Clamp a zoom into the allowed range and round it to an integer (Google Static
 * Maps only honors integer zoom levels). Non-finite input falls back to the
 * default.
 */
export function clampMapZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MAP_ZOOM_DEFAULT;
  const snapped = Math.round(zoom);
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, snapped));
}

// Cache-buster: the staticMap responses carry a long Cache-Control, and the URL
// is otherwise identical for a given coordinate. Bump this whenever the map's
// server-side rendering changes (markers, style, size) so clients fetch the new
// image instead of a stale cached one. v2 = no pin + POI/transit hidden.
const STATIC_MAP_VERSION = '2';

/** Absolute URL of the staticMap proxy for a coordinate. Works on web and native (plain <Image> src). */
export function staticMapUrl(
  lat: number,
  lng: number,
  opts: { zoom?: number; w?: number; h?: number; scale?: number } = {},
): string {
  const projectId = getFirebaseApp().options.projectId;
  if (!projectId) throw new Error('staticMapUrl: Firebase projectId is not set');
  const base = `https://${STATIC_MAP_REGION}-${projectId}.cloudfunctions.net/staticMap`;
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (opts.zoom !== undefined) q.set('zoom', String(opts.zoom));
  if (opts.w !== undefined) q.set('w', String(opts.w));
  if (opts.h !== undefined) q.set('h', String(opts.h));
  if (opts.scale !== undefined) q.set('scale', String(opts.scale));
  q.set('v', STATIC_MAP_VERSION);
  return `${base}?${q.toString()}`;
}

const geocodeFn = () =>
  httpsCallable<{ query: string }, { results: GeocodePlace[] }>(getFirebaseFunctions(), 'geocodeSearch');

/** Geocodes a free-text address/town via the server-side proxy. Returns [] on no match. */
export async function geocodeSearch(query: string): Promise<GeocodePlace[]> {
  const res = await geocodeFn()({ query });
  return res.data.results;
}

const reverseGeocodeFn = () =>
  httpsCallable<{ lat: number; lng: number }, { label: string | null }>(
    getFirebaseFunctions(),
    'reverseGeocode',
  );

/**
 * Human-readable address for a coordinate, via the same server-side proxy.
 * Goes through the server (not `expo-location`'s reverse geocoder) because the
 * device geocoder is native-only — on the web build it always fails, which is
 * how raw coordinates used to end up stored as a location's name. Returns
 * `null` when Google has no match or the lookup fails; callers pick their own
 * fallback label, never a coordinate string.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await reverseGeocodeFn()({ lat, lng });
    return res.data.label;
  } catch {
    return null;
  }
}
