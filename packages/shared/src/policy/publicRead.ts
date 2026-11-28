import { LISTED_EVENT_STATUSES } from '../models/event/EventDataModel';
import { isOrgPrivateEvent } from './eventPrivacy';

/**
 * What an anonymous visitor may see — the answer the server's Admin-SDK readers
 * (read site, sitemap, village broadcasts, Wrapped) give in place of
 * `firestore.rules`, which the Admin SDK bypasses. Raw data in, never a typed
 * doc: those reads are converter-less on purpose (`functions/src/web/read.ts`).
 */

export type RawDoc = Record<string, unknown>;

/** The status each kind is public in: the value the list queries filter on. */
export const PUBLIC_STATUS = {
  news: 'active',
  place: 'active',
  barrio: 'active',
  festivalPoster: 'active',
  historyEntry: 'active',
  vocabularyTerm: 'active',
  vocabularyDefinition: 'active',
  organization: 'approved',
  wrapped: 'published',
} as const;

export type PublicKind = keyof typeof PUBLIC_STATUS | 'event';

/** A cancelled event's page still opens, to say it was cancelled; lists drop it. */
const EVENT_PAGE_STATUSES: readonly string[] = [...LISTED_EVENT_STATUSES, 'cancelled'];
const LISTED: readonly string[] = LISTED_EVENT_STATUSES;

/**
 * Detail pages: may an anonymous visitor open this doc at all? An org-private
 * event's page opens too, but says nothing beyond the fact it exists — the
 * renderer withholds the rest on `isOrgPrivateEvent`.
 */
export function isPublicDoc(kind: PublicKind, raw: RawDoc): boolean {
  if (kind === 'event') return EVENT_PAGE_STATUSES.includes(String(raw['status']));
  return raw['status'] === PUBLIC_STATUS[kind];
}

/** Listings (home, sections, broadcasts): should it be listed? Events also drop when private. */
export function isPubliclyListed(kind: PublicKind, raw: RawDoc): boolean {
  if (kind === 'event') return LISTED.includes(String(raw['status'])) && !isOrgPrivateEvent(raw);
  return isPublicDoc(kind, raw);
}
