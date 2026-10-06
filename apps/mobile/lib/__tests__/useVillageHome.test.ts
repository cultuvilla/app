import { renderHook, waitFor, act } from '@testing-library/react-native';
import { getMunicipalityPeople } from '@cultuvilla/shared/services/municipalityPersonService';
import { getMyCensoAnswers } from '@cultuvilla/shared/services/membershipProfileService';
import { getVillageMembers } from '@cultuvilla/shared/services/villageMemberService';
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

jest.mock('../auth/useAuth', () => {
  const value = { user: { uid: 'u1' }, profile: null, profileChecked: true };
  return { useAuth: () => value };
});
jest.mock('../orgs/useMyOrgIds', () => {
  const value = { orgIds: ['o1'] };
  return { useMyOrgIds: () => value };
});
jest.mock('../firestoreErrorLog', () => ({
  withFirestoreErrorLog: (_label: string, fn: () => unknown) => fn(),
  reportFirestoreError: jest.fn(),
}));
const mockFocusEffects: (() => void)[] = [];
jest.mock('expo-router', () => ({ useFocusEffect: (fn: () => void) => mockFocusEffects.push(fn) }));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  watchMunicipality: mockWatcher('municipality'),
  watchBarrios: mockWatcher('barrios'),
  watchPlaces: mockWatcher('places'),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  isVillageAdmin: jest.fn(async () => false),
  getVillageMembers: jest.fn(async () => [{ userId: 'u1' }, { userId: 'u2' }]),
}));
jest.mock('@cultuvilla/shared/services/membershipProfileService', () => ({
  getMyCensoAnswers: jest.fn(async () => ({ hijos: true })),
}));
jest.mock('@cultuvilla/shared/services/municipalityPersonService', () => ({
  getMunicipalityPeople: jest.fn(async () => [{ personId: 'p1' }, { personId: 'p2' }, { personId: 'p3' }]),
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
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  mockFocusEffects.length = 0;
  (getMunicipalityPeople as jest.Mock).mockImplementation(async () => [
    { personId: 'p1' },
    { personId: 'p2' },
    { personId: 'p3' },
  ]);
  (getVillageMembers as jest.Mock).mockImplementation(async () => [{ userId: 'u1' }, { userId: 'u2' }]);
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

  // Regression: the people directory used to share a Promise.all with the
  // membership fetches. Its rows go through a strict converter, so a single doc
  // predating a newly-added field threw and took isMember/villageAdmin down with
  // the count — the village silently rendered as if you weren't a member.
  it('keeps membership state when the people directory fails to load', async () => {
    (getMunicipalityPeople as jest.Mock).mockRejectedValue(new Error('Invalid input: expected boolean'));
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(result.current.isMember).toBe(true));
    expect(result.current.peopleCount).toBeNull();
  });

  // Census answers are private (censoAnswers/), never read off member docs.
  it("reads the member's own censo answers from the private doc", async () => {
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(result.current.myCensoAnswers).toEqual({ hijos: true }));
    expect(getMyCensoAnswers).toHaveBeenCalledWith('m1', 'u1');
  });

  it('does not read censo answers for a non-member', async () => {
    (getVillageMembers as jest.Mock).mockResolvedValue([{ userId: 'u2' }]);
    const { result } = renderHook(() => useVillageHome('m1'));
    await waitFor(() => expect(getVillageMembers).toHaveBeenCalled());
    expect(result.current.isMember).toBe(false);
    expect(getMyCensoAnswers).not.toHaveBeenCalled();
    expect(result.current.myCensoAnswers).toEqual({});
  });

  it('watches published + completed events, private ones per org, upcoming before past', () => {
    mockInitial['events'] = [{ id: 'ev-past', startDate: new Date('2020-01-01T10:00:00Z'), endDate: null }];
    mockInitial['privateEvents'] = [{ id: 'ev-future', startDate: new Date('2999-01-01T10:00:00Z'), endDate: null }];
    const { result } = renderHook(() => useVillageHome('m1'));
    expect(latest('events').args).toEqual(['m1', ['published', 'completed']]);
    expect(latest('privateEvents').args).toEqual(['m1', ['o1'], ['published', 'completed']]);
    expect(result.current.events.map((e) => e.id)).toEqual(['ev-future', 'ev-past']);
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
