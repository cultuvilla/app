import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { observability } from '@cultuvilla/shared';
import { joinVillage } from '@cultuvilla/shared/services/villageMemberService';

const mockPush = jest.fn();
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
const mockOfferPush = jest.fn();
jest.mock('../../../lib/push/PushProvider', () => ({
  usePush: () => ({
    offerPush: mockOfferPush,
    permission: 'undetermined',
    refreshPermission: jest.fn(),
    requestPermission: jest.fn(),
  }),
}));
jest.mock('@cultuvilla/shared', () => ({
  ...jest.requireActual('@cultuvilla/shared'),
  observability: { trackEvent: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
// Fixtures carry the real `searchPrefixes` shape, because the "Municipios
// activos" group is filtered by testing that array — the same predicate
// Firestore evaluates for the "Todos" query.
const mockPrefixes = (name: string): string[] => {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const out = new Set<string>();
  const push = (src: string) => {
    for (let i = 1; i <= src.length; i++) out.add(src.slice(0, i));
  };
  push(normalized);
  for (const token of normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) push(token);
  return [...out].sort();
};
const mockMuni = (
  id: string,
  name: string,
  communityActive: boolean,
  localityNames: string[] = [],
) => ({
  id,
  name,
  slug: name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-'),
  province: 'Segovia',
  communityActive,
  localityNames,
  searchPrefixes: [...new Set([name, ...localityNames].flatMap(mockPrefixes))].sort(),
});
const mockActive = [mockMuni('m1', 'Anaya', true)];
const mockAll = [
  mockMuni('m1', 'Anaya', true),
  mockMuni('m2', 'Bernuy', false),
  // Figueruela de Arriba is the municipio; Villarino de Manzanas is an entidad
  // singular inside it, and the reason this whole feature exists.
  mockMuni('m3', 'Figueruela de Arriba', false, ['Villarino de Manzanas']),
];

jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  getActiveCommunities: jest.fn(async () => mockActive),
  listMunicipalitiesPage: jest.fn(async ({ search }: { search?: string }) => {
    const key = (search ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return {
      items: key ? mockAll.filter((m) => m.searchPrefixes.includes(key)) : mockAll,
      nextCursor: null,
    };
  }),
  getBarrios: jest.fn(async () => []),
}));
jest.mock('@cultuvilla/shared/services/villageMemberService', () => ({
  getUserMemberships: jest.fn(async () => []),
  joinVillage: jest.fn(async () => undefined),
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, refreshProfile: mockRefreshProfile }),
}));

import { VillageDiscovery } from '../VillageDiscovery';

// VillageDiscovery debounces the search by 200ms before issuing the query, and
// then re-renders on the result. RNTL's 1s default leaves almost no margin for
// that under full-suite load, which made these tests flaky.
const SEARCH_WAIT = { timeout: 5000 };

beforeEach(() => {
  mockPush.mockClear();
  mockRefreshProfile.mockClear();
  (observability.trackEvent as jest.Mock).mockClear();
  (joinVillage as jest.Mock).mockClear();
});

it('opens an active village detail on tap', async () => {
  const { getAllByText } = render(<VillageDiscovery />);
  await waitFor(() => expect(getAllByText('Anaya').length).toBeGreaterThan(0), SEARCH_WAIT);
  fireEvent.press(getAllByText('Anaya')[0]!);
  expect(mockPush).toHaveBeenCalledWith('/anaya');
});

it('opens a dormant municipality on its village home, like an active one', async () => {
  const { getByText } = render(<VillageDiscovery />);
  await waitFor(() => expect(getByText('Bernuy')).toBeTruthy(), SEARCH_WAIT);
  fireEvent.press(getByText('Bernuy'));
  expect(mockPush).toHaveBeenCalledWith('/bernuy');
});

it('fires VILLAGE_JOIN_SUCCESS after confirming a join', async () => {
  const { getByLabelText, getByText } = render(<VillageDiscovery />);
  await waitFor(() => expect(getByLabelText('discover.joinVillage')).toBeTruthy(), SEARCH_WAIT);
  fireEvent.press(getByLabelText('discover.joinVillage'));
  fireEvent.press(getByText('village.joinConfirm.confirm'));
  await waitFor(() => expect(joinVillage).toHaveBeenCalledWith('m1', 'u1', null));
  expect(observability.trackEvent).toHaveBeenCalledWith('village.join.success', { villageId: 'm1' });
  // Joining earns the push soft ask (the policy decides whether it shows).
  expect(mockOfferPush).toHaveBeenCalledWith('village_join', { villageName: 'Anaya' });
});

describe('search matching', () => {
  it('shows the same village in both groups for the same query', async () => {
    const { getByLabelText, getAllByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getAllByText('Anaya').length).toBe(2), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'anaya');
    // Once in "Municipios activos", once in "Todos". The two groups used to
    // disagree: this filter was an accent-sensitive `includes` while "Todos"
    // ran an accent-stripped query in Firestore.
    await waitFor(() => expect(getAllByText('Anaya').length).toBe(2), SEARCH_WAIT);
  });

  it('matches accent-insensitively, like the Firestore query does', async () => {
    const { getByLabelText, getAllByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getAllByText('Anaya').length).toBe(2), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'ANÁY');
    await waitFor(() => expect(getAllByText('Anaya').length).toBe(2), SEARCH_WAIT);
  });

  it('explains that only municipios are listed when nothing matches', async () => {
    const { getByLabelText, getByText, queryByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getByText('Anaya')).toBeTruthy(), SEARCH_WAIT);
    // Wikidata's locality coverage is partial (2,728 of 8,167 municipalities),
    // so a pedanía it does not know about still bottoms out here — hence the
    // hint stays. "villarino de manzanas" is deliberately NOT used: that one
    // now resolves to Figueruela de Arriba, which is the point of the feature.
    fireEvent.changeText(getByLabelText('discover.search'), 'pedanianoconocida');
    await waitFor(() => expect(getByText('discover.emptyHint')).toBeTruthy(), SEARCH_WAIT);
    expect(getByText('discover.emptyHintExample')).toBeTruthy();
    expect(queryByText('Anaya')).toBeNull();
  });

  it('does not render a bare "Todos" header over an empty list', async () => {
    const { getByLabelText, getByText, queryByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getByText('discover.allGroup')).toBeTruthy(), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'zzzz');
    await waitFor(() => expect(queryByText('discover.allGroup')).toBeNull(), SEARCH_WAIT);
  });
});

describe('pedanía search', () => {
  it('finds the municipio when the user searches for a pedanía inside it', async () => {
    const { getByLabelText, getByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getByText('Anaya')).toBeTruthy(), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'villarino de manzanas');
    await waitFor(() => expect(getByText('Figueruela de Arriba')).toBeTruthy(), SEARCH_WAIT);
  });

  it('names the pedanía that caused the match, so the row is not confusing', async () => {
    const { getByLabelText, getByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getByText('Anaya')).toBeTruthy(), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'villarino');
    await waitFor(() => expect(getByText('discover.viaLocality')).toBeTruthy(), SEARCH_WAIT);
  });

  it('does not claim a locality match when the municipio matched on its own name', async () => {
    const { getByLabelText, getByText, queryByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getByText('Anaya')).toBeTruthy(), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'figueruela');
    await waitFor(() => expect(getByText('Figueruela de Arriba')).toBeTruthy(), SEARCH_WAIT);
    expect(queryByText('discover.viaLocality')).toBeNull();
  });

  it('matches a non-leading word of the pedanía too', async () => {
    const { getByLabelText, getByText } = render(<VillageDiscovery />);
    await waitFor(() => expect(getByText('Anaya')).toBeTruthy(), SEARCH_WAIT);
    fireEvent.changeText(getByLabelText('discover.search'), 'manzanas');
    await waitFor(() => expect(getByText('Figueruela de Arriba')).toBeTruthy(), SEARCH_WAIT);
  });
});
