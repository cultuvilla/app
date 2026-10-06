import { resolveStorePlatform } from '@cultuvilla/shared/utils';
import { matchRoute } from './routes';

export const READ_SITE_VISIT_MESSAGE = 'readSite visit';

export type VisitDevice = 'bot' | 'phone' | 'desktop';

/**
 * The structured fields of one served read-site request — the input of the
 * `read_site_visits` log-based metric (scripts/lib/monitoring.mjs).
 *
 * Enums and a status code only: no path, slug, id or user agent. A path names
 * private-ish docs (an org invite) and a UA is a fingerprint, while the metric
 * needs neither — it counts reach by page kind and device.
 */
export interface VisitFields {
  handler: 'readSite';
  page: string;
  entityKind: string | null;
  device: VisitDevice;
  platform: 'ios' | 'android' | 'other';
  status: number;
}

// Link-preview fetchers (WhatsApp, Telegram…) and crawlers. The share preview
// fetch is the most common "visit" a WhatsApp link gets, and it is not a person.
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|discord|slack|linkedin|preview|embedly|headless|lighthouse|curl|wget|python|node-fetch|go-http/i;

export function classifyDevice(userAgent: string | null): Pick<VisitFields, 'device' | 'platform'> {
  if (!userAgent || BOT_UA.test(userAgent)) return { device: 'bot', platform: 'other' };
  const store = resolveStorePlatform(userAgent, 0);
  if (store) return { device: 'phone', platform: store };
  return { device: /Mobi/.test(userAgent) ? 'phone' : 'desktop', platform: 'other' };
}

export function visitFields(pathname: string, userAgent: string | null, status: number): VisitFields {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : '/';
  const route = matchRoute(path);
  const entityKind = route.type === 'entity' ? route.kind : route.type === 'invite' ? 'organization' : null;
  return { handler: 'readSite', page: route.type, entityKind, ...classifyDevice(userAgent), status };
}
