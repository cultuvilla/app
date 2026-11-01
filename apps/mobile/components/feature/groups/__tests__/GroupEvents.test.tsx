import { FlatList } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { GroupEvents } from '../GroupEvents';
import type { OrganizationData } from '@cultuvilla/shared/models/organization';

const mockPush = jest.fn();
let mockEvents: { id: string; title: string; startDate: Date; endDate: null; confirmedCount: number; imageURL: null; villageCoverImage: null }[] = [];
let mockStatus = 'ready';

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/hooks/useWatch', () => ({ useWatch: () => ({ data: mockEvents, status: mockStatus }) }));
jest.mock('../../../../lib/orgs/useEventTaskBadges', () => ({
  useEventTaskBadges: () => (id: string) => (id === 'e1' ? { text: '1/3', spoken: 'uno de tres' } : undefined),
}));

const org = { id: 'Anduela', municipalityId: 'm1' } as OrganizationData & { id: string };

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus = 'ready';
  mockEvents = [
    { id: 'e1', title: 'Matanza', startDate: new Date(Date.now() + 86_400_000), endDate: null, confirmedCount: 0, imageURL: null, villageCoverImage: null },
  ];
});

describe('GroupEvents', () => {
  it('lists in two columns and opens the organizing screen of an event', () => {
    const { UNSAFE_getByType, getByLabelText, getByTestId } = render(<GroupEvents org={org} />);
    expect(UNSAFE_getByType(FlatList).props.numColumns).toBe(2);
    expect(getByTestId('group-events')).toBeTruthy();
    expect(getByTestId('group-events-filter')).toBeTruthy();
    fireEvent.press(getByLabelText(/Matanza/));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/evento/e1');
  });

  it('shows the tasks done of each event, and filters by when', () => {
    mockEvents = [
      ...mockEvents,
      { id: 'old', title: 'Cena pasada', startDate: new Date(Date.now() - 86_400_000 * 30), endDate: null, confirmedCount: 0, imageURL: null, villageCoverImage: null },
    ];
    const { getByTestId, getByText, queryByText } = render(<GroupEvents org={org} />);
    expect(getByTestId('entity-card-progress')).toHaveTextContent(/1\/3/);
    expect(queryByText('Cena pasada')).toBeNull();
    fireEvent.press(getByTestId('group-events-filter-past'));
    expect(getByText('Cena pasada')).toBeTruthy();
    expect(queryByText('Matanza')).toBeNull();
    fireEvent.press(getByTestId('group-events-filter-all'));
    expect(getByText('Cena pasada')).toBeTruthy();
    expect(getByText('Matanza')).toBeTruthy();
  });

  it('creates an event organized by the group, in its village', () => {
    const { getByTestId } = render(<GroupEvents org={org} />);
    fireEvent.press(getByTestId('group-events-create'));
    expect(mockPush).toHaveBeenCalledWith('/crear/evento?villageId=m1&organizerOrgId=Anduela');
  });

  it('keeps the button with no events, and says there are none', () => {
    mockEvents = [];
    const { getByTestId, getByText } = render(<GroupEvents org={org} />);
    expect(getByText('groups.sections.empty.eventos')).toBeTruthy();
    expect(getByTestId('group-events-create')).toBeTruthy();
  });
});
