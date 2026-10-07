import { fireEvent, render, screen } from '@testing-library/react-native';
import { OrgEventsSection } from '../OrgEventsSection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

type Emit = (rows: unknown[]) => void;
const mockWatch = jest.fn();
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByOrganization: (...a: unknown[]) => mockWatch(...a),
}));

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ t: (key: string) => ({ 'organization.events': 'Eventos' })[key] ?? key }),
}));

const day = 24 * 60 * 60 * 1000;
const event = (id: string, title: string, startDate: Date) => ({
  id,
  title,
  startDate,
  endDate: null,
  status: 'published',
  imageURL: null,
  villageCoverImage: null,
  confirmedCount: 0,
  villageSlug: 'matabuena',
});

function answerWith(rows: unknown[]) {
  mockWatch.mockImplementation((_org: string, _opts: unknown, next: Emit) => {
    next(rows);
    return () => undefined;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OrgEventsSection', () => {
  it('hides itself when the organization has no events', () => {
    answerWith([]);
    render(<OrgEventsSection orgId="org-1" includePrivate={false} />);
    expect(screen.queryByText('Eventos')).toBeNull();
  });

  it('lists upcoming events before past ones and opens the tapped event', () => {
    const now = Date.now();
    answerWith([
      event('past', 'Matanza', new Date(now - 30 * day)),
      event('next', 'Comida de verano', new Date(now + 10 * day)),
    ]);
    render(<OrgEventsSection orgId="org-1" includePrivate={false} />);

    expect(screen.getByText('Eventos')).toBeTruthy();
    const titles = screen.getAllByText(/Matanza|Comida de verano/).map((n) => n.props.children);
    expect(titles).toEqual(['Comida de verano', 'Matanza']);

    fireEvent.press(screen.getByText('Matanza'));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('passes the private flag through to the watcher', () => {
    answerWith([]);
    render(<OrgEventsSection orgId="org-1" includePrivate />);
    expect(mockWatch).toHaveBeenCalledWith('org-1', { includePrivate: true }, expect.any(Function), expect.any(Function));
  });
});
