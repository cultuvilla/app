import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './auth/useAuth';
import { useMyOrgIds } from './orgs/useMyOrgIds';
import { withFirestoreErrorLog } from './firestoreErrorLog';
import { useWatch, type WatchStatus } from './hooks/useWatch';
import {
  watchBarrios,
  watchMunicipality,
  watchPlaces,
} from '@cultuvilla/shared/services/municipalityService';
import {
  isVillageAdmin,
  getVillageMembers,
} from '@cultuvilla/shared/services/villageMemberService';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getMyCensoAnswers } from '@cultuvilla/shared/services/membershipProfileService';
import { watchOrganizationsByMunicipality } from '@cultuvilla/shared/services/organizationService';
import { getMyOrganizerRequests } from '@cultuvilla/shared/services/organizerRequestService';
import {
  watchEventsByMunicipality,
  watchPrivateEventsByMunicipality,
} from '@cultuvilla/shared/services/eventService';
import { watchHomeFeed } from '@cultuvilla/shared/services/newsService';
import {
  watchFestivalPosters,
  type FestivalPosterWithId,
} from '@cultuvilla/shared/services/festivalPosterService';
import {
  watchHistoryEntries,
  type HistoryEntryWithId,
} from '@cultuvilla/shared/services/historyService';
import {
  watchVocabularyDefinitions,
  watchVocabularyTerms,
  type VocabularyDefinitionWithId,
  type VocabularyTermWithId,
} from '@cultuvilla/shared/services/vocabularyService';
import { pickWordOfTheDay } from '@cultuvilla/shared/utils/wordOfTheDay';
import {
  eventEndBoundary,
  isStartDayOver,
} from '@cultuvilla/shared/models/event/EventDataModel';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import type { BarrioData, PlaceData } from '@cultuvilla/shared/models/municipality';
import type { OrganizationData } from '@cultuvilla/shared/models/organization';
import type { EventData } from '@cultuvilla/shared/models/event';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import type { ProfileAnswers } from '@cultuvilla/shared/models/municipality/CensoTypes';

/** Independent scroll on the village home; each loads and can fail on its own. */
export type VillageSectionKey =
  | 'events'
  | 'news'
  | 'festivalPosters'
  | 'barrios'
  | 'places'
  | 'organizations'
  | 'history'
  | 'vocabulary';

export type SectionStatus = 'loading' | 'ready' | 'error';

export type SectionStatusMap = Record<VillageSectionKey, SectionStatus>;

export interface WordOfTheDay {
  term: VocabularyTermWithId;
  /** The term's first meaning; null when none has been added yet. */
  definition: VocabularyDefinitionWithId | null;
}

export interface VillageHomeState {
  /** The essential village doc is still loading — the whole tab waits on this. */
  coreLoading: boolean;
  /** The essential village fetch failed — the whole tab shows an error. */
  coreError: string | null;
  village: (MunicipalityData & { id: string }) | null;
  villageAdmin: boolean;
  isMember: boolean;
  /** Ordered by resident count desc, then name — populated barrios lead. */
  barrios: (BarrioData & { id: string })[];
  places: (PlaceData & { id: string })[];
  /** Ordered by member count desc, then name — biggest orgs lead. */
  organizations: (OrganizationData & { id: string })[];
  events: (EventData & { id: string })[];
  news: (NewsPostData & { id: string })[];
  festivalPosters: FestivalPosterWithId[];
  /** Oldest first — the home timeline reads left to right. */
  history: HistoryEntryWithId[];
  wordOfTheDay: WordOfTheDay | null;
  vocabularyCount: number;
  /** null while the members fetch is in flight, so the stat renders "—". */
  peopleCount: number | null;
  pendingOrganizerRequest: boolean;
  /** The current user's censo answers (empty if not a member / none yet). */
  myCensoAnswers: ProfileAnswers;
  /** Per-scroll load state; each section renders a skeleton until 'ready'. */
  sectionStatus: SectionStatusMap;
}

const ALL_LOADING: SectionStatusMap = {
  events: 'loading',
  news: 'loading',
  festivalPosters: 'loading',
  barrios: 'loading',
  places: 'loading',
  organizations: 'loading',
  history: 'loading',
  vocabulary: 'loading',
};

const EMPTY: VillageHomeState = {
  coreLoading: false,
  coreError: null,
  village: null,
  villageAdmin: false,
  isMember: false,
  barrios: [],
  places: [],
  organizations: [],
  events: [],
  news: [],
  festivalPosters: [],
  history: [],
  wordOfTheDay: null,
  vocabularyCount: 0,
  peopleCount: null,
  pendingOrganizerRequest: false,
  myCensoAnswers: {},
  sectionStatus: ALL_LOADING,
};

/** The per-user part of the village home: membership, admin rights, requests. */
interface Chrome {
  villageAdmin: boolean;
  isMember: boolean;
  peopleCount: number | null;
  pendingOrganizerRequest: boolean;
  myCensoAnswers: ProfileAnswers;
}

const NO_CHROME: Chrome = {
  villageAdmin: false,
  isMember: false,
  peopleCount: null,
  pendingOrganizerRequest: false,
  myCensoAnswers: {},
};

const LISTED_STATUSES: ['published', 'completed'] = ['published', 'completed'];
const NEWS_LIMIT = { limit: 10 };
const NO_ROWS: never[] = [];

function sectionStatus(...statuses: WatchStatus[]): SectionStatus {
  if (statuses.includes('error')) return 'error';
  return statuses.includes('loading') ? 'loading' : 'ready';
}

/**
 * Everything the village home (pueblo tab + pushed detail) shows for one
 * municipality. Presentation lives in <VillageHomeBody>; this hook is the single
 * place village-home data is read.
 *
 * The village doc and every scroll are live listeners (`watch*`): on the native
 * SDK they answer from the on-device cache first, so a revisited village paints
 * at once — offline too — and stays current without reloading on focus. Each
 * scroll is its own listener, so one that fails shows its own error row and
 * never blanks the tab. Only the village doc is essential.
 *
 * The per-user chrome (membership, admin rights, requests, censo answers) is a
 * one-shot read refreshed on focus and by `reload`: it changes when the user
 * acts, not when the village does.
 */
export function useVillageHome(municipalityId: string | null) {
  const { user } = useAuth();
  // The viewer's orgs decide which private events this village can show.
  const { orgIds } = useMyOrgIds();
  const uid = user?.uid ?? null;
  const id = municipalityId;

  const core = useWatch<(MunicipalityData & { id: string }) | null>('villageHome:watchMunicipality', id, id ? (next, error) => watchMunicipality(id, next, error) : null);
  const publicEvents = useWatch<(EventData & { id: string })[]>(
    'villageHome:watchEvents',
    id,
    id ? (next, error) => watchEventsByMunicipality(id, LISTED_STATUSES, next, error) : null,
  );
  // Rules do not filter a list, so the private half is one listener per org of
  // the viewer's; losing it must not empty the section.
  const orgKey = orgIds.join(',');
  const privateEvents = useWatch<(EventData & { id: string })[]>(
    'villageHome:watchPrivateEvents',
    id ? `${id}|${orgKey}` : null,
    id ? (next, error) => watchPrivateEventsByMunicipality(id, orgIds, LISTED_STATUSES, next, error) : null,
  );
  const news = useWatch<(NewsPostData & { id: string })[]>('villageHome:watchNews', id, id ? (next, error) => watchHomeFeed(id, NEWS_LIMIT, next, error) : null);
  const posters = useWatch<FestivalPosterWithId[]>('villageHome:watchFestivalPosters', id, id ? (next, error) => watchFestivalPosters(id, next, error) : null);
  const places = useWatch<(PlaceData & { id: string })[]>('villageHome:watchPlaces', id, id ? (next, error) => watchPlaces(id, next, error) : null);
  const barrios = useWatch<(BarrioData & { id: string })[]>('villageHome:watchBarrios', id, id ? (next, error) => watchBarrios(id, next, error) : null);
  const orgs = useWatch<(OrganizationData & { id: string })[]>('villageHome:watchOrganizations', id, id ? (next, error) => watchOrganizationsByMunicipality(id, next, error) : null);
  const history = useWatch<HistoryEntryWithId[]>('villageHome:watchHistoryEntries', id, id ? (next, error) => watchHistoryEntries(id, next, error) : null);
  const terms = useWatch<VocabularyTermWithId[]>('villageHome:watchVocabularyTerms', id, id ? (next, error) => watchVocabularyTerms(id, next, error) : null);

  // One word a day, so its meanings are watched only once the terms are in.
  const todaysTerm = useMemo(
    () => (id && terms.data ? pickWordOfTheDay(terms.data, id, new Date()) : null),
    [id, terms.data],
  );
  const definitions = useWatch<VocabularyDefinitionWithId[]>(
    'villageHome:watchVocabularyDefinitions',
    todaysTerm?.id ?? null,
    todaysTerm ? (next, error) => watchVocabularyDefinitions(todaysTerm.id, next, error) : null,
  );

  const chrome = useChrome(id, uid);

  return useMemo<VillageHomeState & { reload: () => Promise<void> }>(() => {
    if (!id) return { ...EMPTY, reload: chrome.reload };

    // Upcoming first (soonest first), then past (most recent first), split on
    // the end boundary so a multi-day event still running counts as upcoming.
    const allEvents = [...(publicEvents.data ?? NO_ROWS), ...(privateEvents.data ?? NO_ROWS)].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );
    const now = new Date();
    const isPast = (e: EventData) => isStartDayOver(eventEndBoundary(e), now);
    const events = [...allEvents.filter((e) => !isPast(e)), ...allEvents.filter(isPast).reverse()];

    return {
      coreLoading: core.status === 'loading',
      coreError: core.error?.message ?? null,
      village: core.data ?? null,
      ...chrome.value,
      events,
      news: news.data ?? NO_ROWS,
      festivalPosters: posters.data ?? NO_ROWS,
      places: places.data ?? NO_ROWS,
      // Populated barrios and the biggest orgs first; both counts are
      // denormalized onto each doc, so this sorts in memory with no extra reads.
      barrios: [...(barrios.data ?? NO_ROWS)].sort(
        (a, b) => b.residentCount - a.residentCount || a.name.localeCompare(b.name),
      ),
      organizations: [...(orgs.data ?? NO_ROWS)].sort(
        (a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name),
      ),
      // The service returns newest first; the home timeline reads left to right.
      history: [...(history.data ?? NO_ROWS)].reverse(),
      wordOfTheDay: todaysTerm ? { term: todaysTerm, definition: definitions.data?.[0] ?? null } : null,
      vocabularyCount: terms.data?.length ?? 0,
      sectionStatus: {
        // A failed private half degrades to public events only.
        events: sectionStatus(publicEvents.status, privateEvents.status === 'error' ? 'ready' : privateEvents.status),
        news: sectionStatus(news.status),
        festivalPosters: sectionStatus(posters.status),
        places: sectionStatus(places.status),
        barrios: sectionStatus(barrios.status),
        organizations: sectionStatus(orgs.status),
        history: sectionStatus(history.status),
        vocabulary: sectionStatus(terms.status, todaysTerm ? definitions.status : 'ready'),
      },
      reload: chrome.reload,
    };
  }, [id, core, publicEvents, privateEvents, news, posters, places, barrios, orgs, history, terms, todaysTerm, definitions, chrome]);
}

function useChrome(municipalityId: string | null, uid: string | null) {
  const [value, setValue] = useState<Chrome>(NO_CHROME);
  // Only the latest load may commit: a focus re-fire or a village switch
  // supersedes a load still in flight.
  const runId = useRef(0);

  const reload = useCallback(async () => {
    const myRun = (runId.current += 1);
    if (!municipalityId) {
      setValue(NO_CHROME);
      return;
    }
    const commit = (next: Chrome) => {
      if (runId.current === myRun) setValue(next);
    };
    // The people directory is fetched on its own, NOT inside the Promise.all
    // below. Its rows go through a strict converter, so one doc that predates a
    // schema field throws — and sharing a Promise.all would take membership,
    // admin rights and censo answers down with the count, silently rendering the
    // village as if you weren't a member. Losing just the stat is acceptable.
    const peopleCount = await withFirestoreErrorLog('villageHome:getMunicipalityPeople', () =>
      getMunicipalityPeople(municipalityId),
    )
      .then((people) => people.length)
      .catch(() => null);
    try {
      const [isAdmin, myReqs, members] = await Promise.all([
        uid
          ? withFirestoreErrorLog('villageHome:isVillageAdmin', () => isVillageAdmin(municipalityId, uid))
          : Promise.resolve(false),
        uid
          ? withFirestoreErrorLog('villageHome:getMyOrganizerRequests', () => getMyOrganizerRequests(uid))
          : Promise.resolve([]),
        withFirestoreErrorLog('villageHome:getVillageMembers', () => getVillageMembers(municipalityId)),
      ]);
      const isMember = uid != null && members.some((m) => m.userId === uid);
      // Answers are private (censoAnswers/), so only a member's own are fetched.
      const myCensoAnswers =
        uid != null && isMember
          ? await withFirestoreErrorLog('villageHome:getMyCensoAnswers', () =>
              getMyCensoAnswers(municipalityId, uid),
            ).catch(() => ({}))
          : {};
      commit({
        villageAdmin: isAdmin,
        isMember,
        peopleCount,
        pendingOrganizerRequest: myReqs.some(
          (r) => r.municipalityId === municipalityId && r.status === 'pending',
        ),
        myCensoAnswers,
      });
    } catch {
      // Chrome degrades silently to the non-member view; the error is already
      // logged by withFirestoreErrorLog and must not take down the tab.
      commit({ ...NO_CHROME, peopleCount });
    }
  }, [municipalityId, uid]);

  // A village switch starts from the non-member view rather than showing the
  // previous village's membership while the new one loads.
  useEffect(() => {
    setValue(NO_CHROME);
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return useMemo(() => ({ value, reload }), [value, reload]);
}
