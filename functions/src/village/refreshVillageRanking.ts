import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore, type Query } from 'firebase-admin/firestore';
import {
  eventsCollection,
  festivalPostersCollection,
  historyEntriesCollection,
  municipalitiesCollection,
  municipalityPeopleCollection,
  municipalityPlacesCollection,
  newsCollection,
  organizationsCollection,
  villageRankingDoc,
  vocabularyTermsCollection,
} from '@cultuvilla/shared/firebase/refs/admin';
import {
  rankVillages,
  VILLAGE_RANKING_DOC,
  type RankedVillage,
  type VillageContentCounts,
} from '@cultuvilla/shared/models';

async function count<T>(query: Query<T>): Promise<number> {
  return (await query.count().get()).data().count;
}

/**
 * What a pueblo shows an anonymous visitor, counted with the same filters its
 * public page lists by (functions/src/web/data.ts). Equality filters only, so
 * no count needs a composite index of its own.
 */
async function countContent(db: Firestore, municipalityId: string): Promise<VillageContentCounts> {
  const publicEvents = eventsCollection(db)
    .where('municipalityId', '==', municipalityId)
    .where('visibility', '==', 'public');
  const active = <T>(q: Query<T>) => q.where('municipalityId', '==', municipalityId).where('status', '==', 'active');
  const [upcomingEvents, events, news, posters, organizations, places, history, words, people] = await Promise.all([
    // `completeExpiredEvents` flips an event to completed once its last day is over.
    count(publicEvents.where('status', '==', 'published')),
    count(publicEvents.where('status', 'in', ['published', 'completed'])),
    count(active(newsCollection(db))),
    count(active(festivalPostersCollection(db))),
    count(
      organizationsCollection(db).where('municipalityId', '==', municipalityId).where('status', '==', 'approved'),
    ),
    count(municipalityPlacesCollection(db, municipalityId).where('status', '==', 'active')),
    count(active(historyEntriesCollection(db))),
    count(active(vocabularyTermsCollection(db))),
    count(municipalityPeopleCollection(db).where('municipalityId', '==', municipalityId)),
  ]);
  return { upcomingEvents, events, news, posters, organizations, places, history, words, people };
}

export async function computeVillageRanking(db: Firestore): Promise<RankedVillage[]> {
  const snap = await municipalitiesCollection(db).where('communityActive', '==', true).get();
  const entries = await Promise.all(
    snap.docs
      .filter((d) => d.data().slug)
      .map(async (d) => ({ id: d.id, municipality: d.data(), counts: await countContent(db, d.id) })),
  );
  return rankVillages(entries);
}

/**
 * Rewrites the "pueblos with the most to show" ranking the village page's
 * "Descubre otros pueblos" row reads. Nightly is fresh enough for discovery,
 * and costs a handful of count queries per active pueblo instead of one per
 * village-page view.
 */
export const refreshVillageRanking = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Europe/Madrid', timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    const villages = await computeVillageRanking(db);
    await villageRankingDoc(db, VILLAGE_RANKING_DOC).set({ computedAt: new Date(), villages });
    logger.info('Refreshed village ranking', {
      handler: 'refreshVillageRanking',
      ranked: villages.length,
      top: villages[0]?.slug ?? null,
    });
  },
);
