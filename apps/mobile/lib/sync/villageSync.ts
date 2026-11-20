import { variantImageURL } from '@cultuvilla/shared/utils/imageVariants';
import { pickWordOfTheDay } from '@cultuvilla/shared/utils/wordOfTheDay';
import type { Unwatch } from '@cultuvilla/shared/services/watch';
import { villageHomeWatchers as w } from '../village/villageHomeWatchers';
import type { Watcher } from '../hooks/useWatch';
import { reportWatchError } from '../firestoreErrorLog';

/**
 * How many cards of each scroll get their image prefetched — what a horizontal
 * scroll shows before the user swipes. The rest load on demand as before.
 */
export const PREFETCH_PER_SECTION = 8;

/**
 * At most this many villages are kept in sync. Almost everyone belongs to one
 * or two; the cap bounds the reads of an account that belongs to many.
 */
export const MAX_SYNCED_VILLAGES = 5;

export type PrefetchImages = (urls: string[]) => void;

/**
 * The villages to keep on the device, in priority order: the one on screen
 * (a signed-in user's active village, or the one a guest last opened), then
 * every village the user is a member of. Deduplicated and capped.
 */
export function villagesToSync(activeId: string | null, memberIds: string[]): string[] {
  const ids = activeId ? [activeId, ...memberIds] : memberIds;
  return [...new Set(ids)].slice(0, MAX_SYNCED_VILLAGES);
}

/** The card images of a scroll's first rows, as the card requests them. */
export function cardImages<T>(rows: readonly T[], imageOf: (row: T) => string | null | undefined): string[] {
  const urls: string[] = [];
  for (const row of rows.slice(0, PREFETCH_PER_SECTION)) {
    const url = variantImageURL(imageOf(row), 'card');
    if (url) urls.push(url);
  }
  return urls;
}

function open<T>(label: string, watcher: Watcher<T>, onRows?: (rows: T) => void): Unwatch {
  return watcher(
    (rows) => onRows?.(rows),
    (error) => {
      reportWatchError(`villageSync:${label}`, error);
    },
  );
}

/**
 * Opens every listener the village home reads for one village, so its data is
 * in Firestore's on-device cache before the user opens it — and opens offline.
 * Each listener answers from the cache, then syncs with the server and stays
 * live until the returned `Unwatch` closes it. As rows arrive, the card images
 * of each scroll's first rows are handed to `prefetch`.
 *
 * The listeners are the home's own (`villageHomeWatchers`), so a village the
 * home is showing costs no extra reads: the SDK shares one target per query.
 *
 * News images are not prefetched: a news card resolves its Storage path to a
 * download URL on render, a network call of its own.
 */
export function syncVillage(municipalityId: string, orgIds: string[], prefetch: PrefetchImages): Unwatch {
  const id = municipalityId;
  let unwatchDefinitions: Unwatch | null = null;
  let todaysTermId: string | null = null;

  const unwatches: Unwatch[] = [
    open('municipality', w.municipality(id)),
    open('events', w.publicEvents(id), (rows) => {
      prefetch(cardImages(rows, (e) => e.imageURL ?? e.villageCoverImage));
    }),
    open('news', w.news(id)),
    open('festivalPosters', w.festivalPosters(id), (rows) => {
      prefetch(cardImages(rows, (p) => p.images[0]));
    }),
    open('places', w.places(id), (rows) => {
      prefetch(cardImages(rows, (p) => p.images[0]));
    }),
    open('barrios', w.barrios(id), (rows) => {
      prefetch(cardImages(rows, (b) => b.images[0]));
    }),
    open('organizations', w.organizations(id), (rows) => {
      prefetch(cardImages(rows, (o) => o.images[0]));
    }),
    open('history', w.history(id), (rows) => {
      prefetch(cardImages(rows, (h) => h.images[0]?.url));
    }),
    // The word of the day shows one term's meanings, so only that term's are watched.
    open('vocabularyTerms', w.vocabularyTerms(id), (terms) => {
      const term = pickWordOfTheDay(terms, id, new Date());
      if ((term?.id ?? null) === todaysTermId) return;
      unwatchDefinitions?.();
      todaysTermId = term?.id ?? null;
      unwatchDefinitions = term ? open('vocabularyDefinitions', w.vocabularyDefinitions(term.id)) : null;
    }),
  ];
  if (orgIds.length > 0) unwatches.push(open('privateEvents', w.privateEvents(id, orgIds)));

  return () => {
    for (const unwatch of unwatches) unwatch();
    unwatchDefinitions?.();
  };
}
