import { watchBarrios, watchMunicipality, watchPlaces } from '@cultuvilla/shared/services/municipalityService';
import { watchOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';
import {
  watchEventsByMunicipality,
  watchPrivateEventsByMunicipality,
} from '@cultuvilla/shared/services/eventService';
import { watchHomeFeed } from '@cultuvilla/shared/services/newsService';
import { watchFestivalPosters, type FestivalPosterWithId } from '@cultuvilla/shared/services/festivalPosterService';
import { watchHistoryEntries, type HistoryEntryWithId } from '@cultuvilla/shared/services/historyService';
import {
  watchVocabularyDefinitions,
  watchVocabularyTerms,
  type VocabularyDefinitionWithId,
  type VocabularyTermWithId,
} from '@cultuvilla/shared/services/vocabularyService';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import type { BarrioData, PlaceData } from '@cultuvilla/shared/models/municipality';
import type { OrganizationData } from '@cultuvilla/shared/models/organization';
import type { EventData } from '@cultuvilla/shared/models/event';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { LISTED_EVENT_STATUSES } from '@cultuvilla/shared/models/event/EventDataModel';
import type { Watcher } from '../hooks/useWatch';

const NEWS_LIMIT = { limit: 10 };

/**
 * The listeners behind the village home, one factory per scroll.
 *
 * The home (`useVillageHome`) and the background village sync (`lib/sync`)
 * both build their listeners here, so they ask Firestore the very same
 * queries: the sync then warms exactly the cache the home reads, and while
 * both are open the SDK serves them from one shared target — no second read.
 */
export const villageHomeWatchers = {
  municipality: (id: string): Watcher<(MunicipalityData & { id: string }) | null> =>
    (next, error) => watchMunicipality(id, next, error),
  publicEvents: (id: string): Watcher<(EventData & { id: string })[]> =>
    (next, error) => watchEventsByMunicipality(id, LISTED_EVENT_STATUSES, next, error),
  /** Rules do not filter a list, so the private half is one listener per org of the viewer's. */
  privateEvents: (id: string, orgIds: string[]): Watcher<(EventData & { id: string })[]> =>
    (next, error) => watchPrivateEventsByMunicipality(id, orgIds, LISTED_EVENT_STATUSES, next, error),
  news: (id: string): Watcher<(NewsPostData & { id: string })[]> =>
    (next, error) => watchHomeFeed(id, NEWS_LIMIT, next, error),
  festivalPosters: (id: string): Watcher<FestivalPosterWithId[]> =>
    (next, error) => watchFestivalPosters(id, next, error),
  places: (id: string): Watcher<(PlaceData & { id: string })[]> => (next, error) => watchPlaces(id, next, error),
  barrios: (id: string): Watcher<(BarrioData & { id: string })[]> => (next, error) => watchBarrios(id, next, error),
  organizations: (id: string): Watcher<(OrganizationData & { id: string })[]> =>
    (next, error) => watchOrganizationsByMunicipality(id, undefined, next, error),
  history: (id: string): Watcher<HistoryEntryWithId[]> => (next, error) => watchHistoryEntries(id, next, error),
  vocabularyTerms: (id: string): Watcher<VocabularyTermWithId[]> =>
    (next, error) => watchVocabularyTerms(id, next, error),
  vocabularyDefinitions: (termId: string): Watcher<VocabularyDefinitionWithId[]> =>
    (next, error) => watchVocabularyDefinitions(termId, next, error),
};
