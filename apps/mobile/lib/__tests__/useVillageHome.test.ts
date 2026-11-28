import { renderHook, waitFor, act } from '@testing-library/react-native';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getMyCensoAnswers } from '@cultuvilla/shared/services/membershipProfileService';
import { getVillageMemberRole } from '@cultuvilla/shared/services/villageMemberService';
import { useVillageHome } from '../useVillageHome';

/**
 * Each `watch*` service function is replaced by a controllable listener: it
 * records its callbacks and answers at once with `mockInitial[name]`, so a test
 * can later push an update (`emit`) or a failure (`fail`) the way a Firestore
 * listener would.
 */
type Listener = { args: unknown[]; onNext: (v: unknown) => void; onError: (e: Error) => void; closed: boolean };
const mockListeners: Record<string, Listener[]> = {};
const mockInitial: Record<string, unknown> = {};

function mockWatcher(name: string) {
  return (...args: unknown[]) => {
    const onError = args.pop() as (e: Error) => void;
    const onNext = args.pop() as (v: unknown) => void;
    const listener: Listener = { args, onNext, onError, closed: false };
    (mockListeners[name] ??= []).push(listener);
    if (mockInitial[name] instanceof Error) onError(mockInitial[name]);
    else onNext(mockInitial[name]);
    return () => {
      listener.closed = true;
    };
  };
}

function latest(name: string): Listener {
  const all = mockListeners[name] ?? [];
  const last = all[all.length - 1];
  if (!last) throw new Error(`${name} was never watched`);
  return last;
}

function emit(name: string, value: unknown) {
  act(() => latest(name).onNext(value));
}

const mockAuth: { user: { uid: string } | null; profile: null; profileChecked: boolean } = {
  user: { uid: 'u1' },
  profile: null,
  profileChecked: true,
};
jest.mock('../auth/useAuth', () => ({ useAuth: () => mockAuth }));
jest.mock('../orgs/useMyOrgIds', () => {
  const value = { orgIds: ['o1'] };
  return { useMyOrgIds: () => value };
});
jest.mock('../firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
  reportFirestoreError: jest.fn(), reportWatchError: jest.fn(), reportWatchStall: jest.fn(),
}));
const mockFocusEffects: (() => void)[] = [];
jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => void) => mockFocusEffects.push(fn) }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchMunicipality: mockWatcher('municipality'),
  watchBarrios: mockWatcher('barrios'),
  watchPlaces: mockWatcher('places'),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getVillageMemberRole: jest.fn(async () => 'user'),
}));
jest.mock('@cultuvilla/shared/services/membershipProfileService', () => ({
  getMyCensoAnswers: jest.fn(async () => ({ hijos: true })),
}));
jest.mock('@cultuvilla/shared/services/municipalityPersonService', () => ({
  getMunicipalityPeople: jest.fn(async () => []),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  watchOrganizationsByMunicipality: mockWatcher('orgs'),
}));
jest.mock('@cultuvilla/shared/services/organizerRequestService', () => ({
  getMyOrganizerRequests: jest.fn(async () => []),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByMunicipality: mockWatcher('events'),
  watchPrivateEventsByMunicipality: mockWatcher('privateEvents'),
}));
jest.mock('@cultuvilla/shared/services/newsService', () => ({ watchHomeFeed: mockWatcher('news') }));
jest.mock('@cultuvilla/shared/services/festivalPosterService', () => ({
  watchFestivalPosters: mockWatcher('posters'),
}));
jest.mock('@cultuvilla/shared/services/historyService', () => ({
  watchHistoryEntries: mockWatcher('history'),
}));
jest.mock('@cultuvilla/shared/services/vocabularyService', () => ({
  watchVocabularyTerms: mockWatcher('terms'),
  watchVocabularyDefinitions: mockWatcher('definitions'),
}));

const VILLAGE = {
  id: 'm1',
  name: 'Anaya',
  province: 'Segovia',
  communityActive: true,
  community: { organizerId: null, description: null },
  peopleCount: 3,
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  mockFocusEffects.length = 0;
  mockAuth.user = { uid: 'u1' };
  (getVillageMemberRole as jest.Mock).mockImplementation(async () => 'user');
  Object.assign(mockInitial, {
    municipality: VILLAGE,
    barrios: [{ id: 'b1', name: 'Centro', status: 'active', residentCount: 0 }],
    places: [],
    orgs: [],
    events: [],
    privateEvents: [],
    news: [],
    posters: [{ id: 'p1', year: 2024, status: 'active' }],
    history: [],
    terms: [],
    definitions: [],
  });
});

describe('useVillageHome', () => {
  it('aggregates the live village data and the viewer’s membership', async () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.coreLoading).toBe(false);
    expect(result.current.village?.name).toBe('Anaya');
    expect(result.current.barrios).toHaveLength(1);
    expect(result.current.festivalPosters).toHaveLength(1);
    expect(result.current.sectionStatus.events).toBe('ready');
    await waitFor(() => expect(result.current.isMember).toBe(true));
    expect(result.current.peopleCount).toBe(3);
  });

  it('reports the membership unknown until it has been read, then known', async () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.membershipKnown).toBe(false);
    expect(result.current.isMember).toBe(false);
    await waitFor(() => expect(result.current.membershipKnown).toBe(true));
    expect(result.current.isMember).toBe(true);
  });

  it('puts the municipal seat first, ahead of more populated settlements', () => {
    mockInitial.barrios = [
      { id: 'p1', name: 'Cañicosa', status: 'active', residentCount: 9, isSeat: false },
      { id: 's1', name: 'Matabuena', status: 'active', residentCount: 2, isSeat: true },
      { id: 'p2', name: 'Matamala', status: 'active', residentCount: 4, isSeat: false },
    ];
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.barrios.map((b) => b.id)).toEqual(['s1', 'p1', 'p2']);
  });

  it('shows an update the moment the listener delivers it, with no reload', () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    emit('posters', [
      { id: 'p2', year: 2025, status: 'active' },
      { id: 'p1', year: 2024, status: 'active' },
    ]);
    expect(result.current.festivalPosters.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(mockListeners['posters']).toHaveLength(1);
  });

  it('keeps one listener per section across focus and reload', async () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    await act(async () => {
      for (const focus of mockFocusEffects) focus();
      await result.current.reload();
    });
    for (const name of ['municipality', 'events', 'news', 'posters', 'places', 'barrios', 'orgs', 'history', 'terms']) {
      expect(mockListeners[name]).toHaveLength(1);
    }
  });

  it('closes the old village’s listeners when the village changes', () => {
    const { rerender } = renderHook(({ id }: { id: string }) => useVillageHome(id), {
      initialProps: { id: 'm1' },
    });
    const first = latest('events');
    rerender({ id: 'm2' });
    expect(first.closed).toBe(true);
    expect(latest('events').args[0]).toBe('m2');
  });

  // The people directory is member-only, so the count comes off the public
  // village doc — a visitor sees it too, and the home never reads the people directory.
  it('shows a non-member the people count from the village doc', async () => {
    (getVillageMemberRole as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(getVillageMemberRole).toHaveBeenCalled());
    expect(result.current.isMember).toBe(false);
    expect(result.current.peopleCount).toBe(3);
    emit('municipality', { ...VILLAGE, peopleCount: 4 });
    expect(result.current.peopleCount).toBe(4);
    expect(getMunicipalityPeople).not.toHaveBeenCalled();
  });

  // One read of the viewer's own member doc answers "member?" and "admin?";
  // the home never lists the village's members.
  it('reads only the viewer’s own member doc for membership', async () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(result.current.membershipKnown).toBe(true));
    expect(getVillageMemberRole).toHaveBeenCalledWith('m1', 'u1');
    expect(result.current.isMember).toBe(true);
    expect(result.current.villageAdmin).toBe(false);
  });

  it('makes a village admin a member and an admin', async () => {
    (getVillageMemberRole as jest.Mock).mockResolvedValue('admin');
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(result.current.villageAdmin).toBe(true));
    expect(result.current.isMember).toBe(true);
  });

  it('makes no membership read for a signed-out guest', async () => {
    mockAuth.user = null;
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(result.current.membershipKnown).toBe(true));
    expect(getVillageMemberRole).not.toHaveBeenCalled();
    expect(getMyCensoAnswers).not.toHaveBeenCalled();
    expect(result.current.isMember).toBe(false);
    expect(result.current.villageAdmin).toBe(false);
  });

  it('renders the people count as unknown while the village doc loads', () => {
    mockInitial['municipality'] = null;
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.peopleCount).toBeNull();
  });

  // Census answers are private (censoAnswers/), never read off member docs.
  it("reads the member's own censo answers from the private doc", async () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(result.current.myCensoAnswers).toEqual({ hijos: true }));
    expect(getMyCensoAnswers).toHaveBeenCalledWith('m1', 'u1');
  });

  it('does not read censo answers for a non-member', async () => {
    (getVillageMemberRole as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(getVillageMemberRole).toHaveBeenCalled());
    expect(result.current.isMember).toBe(false);
    expect(getMyCensoAnswers).not.toHaveBeenCalled();
    expect(result.current.myCensoAnswers).toEqual({});
  });

  // municipalityPeople is readable by members and app admins only; asking for
  // it as anyone else was refused on every load (95 denials in prod over 30
  // days). The home no longer reads it for anyone, member included.
  it("never asks for the village's people, member or not", async () => {
    const member = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(member.result.current.isMember).toBe(true));
    expect(member.result.current.peopleCount).toBe(3);

    (getVillageMemberRole as jest.Mock).mockResolvedValue(null);
    const visitor = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(getVillageMemberRole).toHaveBeenCalledTimes(2));
    expect(visitor.result.current.peopleCount).toBe(3);
    expect(getMunicipalityPeople).not.toHaveBeenCalled();
  });

  it('watches published + completed events, private ones per org, upcoming before past', () => {
    mockInitial['events'] = [{ id: 'ev-past', startDate: new Date('2020-01-01T10:00:00Z'), endDate: null }];
    mockInitial['privateEvents'] = [{ id: 'ev-future', startDate: new Date('2999-01-01T10:00:00Z'), endDate: null }];
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(latest('events').args).toEqual(['m1', ['published', 'completed']]);
    expect(latest('privateEvents').args).toEqual(['m1', ['o1'], ['published', 'completed']]);
    expect(result.current.events.map((e) => e.id)).toEqual(['ev-future', 'ev-past']);
  });

  it('shows each weekly series once: its next date, or its latest once it is over', () => {
    const occ = (id: string, seriesId: string, start: string) => ({
      id,
      startDate: new Date(start),
      endDate: null,
      series: { id: seriesId, index: 0, weekdays: [2], until: new Date('2999-12-01') },
    });
    mockInitial['events'] = [
      occ('yoga-past', 'yoga', '2020-01-07T18:00:00Z'),
      occ('yoga-next', 'yoga', '2999-01-06T18:00:00Z'),
      occ('yoga-after', 'yoga', '2999-01-13T18:00:00Z'),
      occ('taller-1', 'taller', '2020-02-04T18:00:00Z'),
      occ('taller-2', 'taller', '2020-02-11T18:00:00Z'),
      { id: 'solo', startDate: new Date('2999-02-01T10:00:00Z'), endDate: null, series: null },
    ];
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.events.map((e) => e.id)).toEqual(['yoga-next', 'solo', 'taller-2']);
  });

  it('marks only the failing section as errored', () => {
    mockInitial['events'] = new Error('boom');
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.sectionStatus.events).toBe('error');
    expect(result.current.coreError).toBeNull();
    expect(result.current.village?.name).toBe('Anaya');
  });

  it('keeps public events when the private half fails', () => {
    mockInitial['events'] = [{ id: 'ev', startDate: new Date('2999-01-01T10:00:00Z'), endDate: null }];
    mockInitial['privateEvents'] = new Error('permission-denied');
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.sectionStatus.events).toBe('ready');
    expect(result.current.events.map((e) => e.id)).toEqual(['ev']);
  });

  it('returns the empty state, watching nothing, for a null municipalityId', () => {
    const { result } = renderHook(() => useVillageHome(null));
    expect(result.current.coreLoading).toBe(false);
    expect(result.current.village).toBeNull();
    expect(result.current.isMember).toBe(false);
    expect(mockListeners['municipality']).toBeUndefined();
  });

  it('lays the history out oldest first, the way a timeline reads left to right', () => {
    // The service returns newest first (what the full timeline screen wants).
    mockInitial['history'] = [{ id: 'h1956' }, { id: 'h1558' }, { id: 'h1136' }];
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.history.map((e) => e.id)).toEqual(['h1136', 'h1558', 'h1956']);
  });

  it('picks a word of the day and watches only that word’s meanings', () => {
    mockInitial['terms'] = [{ id: 'm1__miaja', term: 'miaja' }];
    mockInitial['definitions'] = [
      { id: 'd1', definition: 'Un poco.' },
      { id: 'd2', definition: 'Una migaja.' },
    ];
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(mockListeners['definitions']).toHaveLength(1);
    expect(latest('definitions').args).toEqual(['m1__miaja']);
    expect(result.current.sectionStatus.vocabulary).toBe('ready');
    expect(result.current.wordOfTheDay).toEqual({
      term: { id: 'm1__miaja', term: 'miaja' },
      definition: { id: 'd1', definition: 'Un poco.' },
    });
    expect(result.current.vocabularyCount).toBe(1);
  });

  it('has no word of the day, and watches no meanings, when the village has no words', () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(result.current.sectionStatus.vocabulary).toBe('ready');
    expect(result.current.wordOfTheDay).toBeNull();
    expect(mockListeners['definitions']).toBeUndefined();
  });
});
