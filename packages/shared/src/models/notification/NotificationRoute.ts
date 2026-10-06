import type { NotificationData } from './NotificationDataModel';
import {
  entityPath,
  villagePath,
  villageSectionPath,
  wordPath,
  wrappedPath,
  type UrlEntityKind,
} from '../../utils/urls';
import { termSlugFromId } from '../vocabulary/VocabularyTermDataModel';
import { yearOfWrappedId } from '../wrapped/WrappedDataModel';

/**
 * Where tapping a notification should land, as an Expo Router path.
 *
 * Pure and shared on purpose: the SAME function resolves the destination for a
 * row tapped inside the Buzón and for a push tapped on the lock screen. Two
 * implementations would drift, and the one nobody can see in the simulator —
 * the push path — is the one that would rot.
 *
 * Every path is village-first (`/<pueblo>/evento/…`), and a notification stores
 * its `municipalityId`, not the pueblo's slug — so the caller passes the slug
 * it looked up. The entity's ref carries no title (`_<id>`): the id is all the
 * screen reads, and the notification doesn't hold the entity's current title.
 *
 * Returns null when there is no slug or the notification refers to nothing
 * openable (a rejected request has no screen of its own); callers fall back to
 * the Buzón.
 */
export type NotificationRouteInput = Pick<
  NotificationData,
  'type' | 'eventId' | 'entityKind' | 'entityId' | 'municipalityId'
>;

const ENTITY_KINDS: Partial<Record<NonNullable<NotificationData['entityKind']>, UrlEntityKind>> = {
  event: 'event',
  news: 'news',
  organization: 'organization',
  place: 'place',
  barrio: 'barrio',
  festivalPoster: 'festivalPoster',
  historyEntry: 'historyEntry',
};

export function notificationRoute(
  n: NotificationRouteInput,
  villageSlug: string | null,
): string | null {
  if (!villageSlug) return null;
  const at = (kind: UrlEntityKind, id: string) => entityPath(kind, { id, title: '', villageSlug });

  // An event id is the most specific thing a notification can carry, and every
  // type that sets one is about that event.
  if (n.eventId) return at('event', n.eventId);

  if (n.entityId && n.entityKind) {
    if (n.entityKind === 'vocabularyTerm') return wordPath(villageSlug, termSlugFromId(n.entityId));
    const kind = ENTITY_KINDS[n.entityKind];
    if (kind) return at(kind, n.entityId);
  }

  if (n.type === 'org_approved' || n.type === 'org_rejected') {
    return villageSectionPath(villageSlug, 'entidades');
  }
  if (n.type === 'village_wrapped_reminder') {
    const year = yearOfWrappedId(n.entityId);
    const screen = villageSectionPath(villageSlug, 'resumen');
    return year === null ? screen : `${screen}?year=${String(year)}`;
  }
  if (n.type === 'village_wrapped_published') {
    const year = yearOfWrappedId(n.entityId);
    return year === null ? villagePath(villageSlug) : wrappedPath(villageSlug, year);
  }
  if (n.type === 'organizer_request_approved' || n.type === 'organizer_request_rejected') {
    return villagePath(villageSlug);
  }

  return null;
}
