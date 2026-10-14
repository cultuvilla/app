import { render, fireEvent } from '@testing-library/react-native';
import { ManagedEventsScroll, type ManagedEvent } from '../ManagedEventsScroll';

// The cards speak their counts through useT (EntityCard's accessibility label).
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

const NOW = new Date('2026-06-15T19:00:00Z');

function makeEvent(over: Partial<ManagedEvent> & { id: string }): ManagedEvent {
  return {
    id: over.id,
    title: over.title ?? over.id,
    description: '',
    startDate: over.startDate ?? new Date('2026-07-01T18:00:00Z'),
    endDate: over.endDate ?? null,
    location: { coordinates: { lat: 40.4, lng: -3.7 }, displayName: 'Plaza' },
    imageURL: null,
    maxAttendees: null,
    telephoneRequired: false,
    requiresPayment: false,
    signupFields: [],
    attendeesVisibility: 'members' as const,
    visibility: 'public' as const,
    visibilityOrgId: null,
    signupGroupSize: 1,
    minBirthYear: null,
    maxBirthYear: null,
    signupEnabled: true,
    signupInfo: null,
    status: over.status ?? 'published',
    organizerUserIds: ['uid-1'],
    organizerOrgIds: [],
    createdBy: 'uid-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    municipalityId: 'm-1',
    villageSlug: 'villa',
    villageName: 'Villa',
    villageCoverImage: null,
    villageCoordinates: null,
    confirmedCount: 0,
    totalCount: 0,
    commentCount: 0,
    readCount: 0,
    endBoundary: over.endDate ?? over.startDate ?? new Date('2026-07-01T18:00:00Z'),
  } as ManagedEvent;
}

// A future (not-ongoing) event listed first, an ongoing one second.
const FUTURE = makeEvent({ id: 'future', title: 'Futuro', startDate: new Date('2026-07-01T18:00:00Z') });
const ONGOING = makeEvent({
  id: 'ongoing',
  title: 'En marcha',
  startDate: new Date('2026-06-15T18:00:00Z'),
});

describe('ManagedEventsScroll', () => {
  it('renders a card per event', () => {
    const { getByText } = render(
      <ManagedEventsScroll
        events={[FUTURE, ONGOING]}
        now={NOW}
        ongoingLabel="En curso"
        emptyLabel="Aún no gestionas ningún evento"
        onPressEvent={() => {}}
      />,
    );
    expect(getByText('Futuro')).toBeTruthy();
    expect(getByText('En marcha')).toBeTruthy();
  });

  it('badges the ongoing event with the ongoing label', () => {
    const { getByText } = render(
      <ManagedEventsScroll
        events={[FUTURE, ONGOING]}
        now={NOW}
        ongoingLabel="En curso"
        emptyLabel="vacío"
        onPressEvent={() => {}}
      />,
    );
    expect(getByText('En curso')).toBeTruthy();
  });

  it('hoists ongoing events before non-ongoing ones', () => {
    const { getAllByText } = render(
      <ManagedEventsScroll
        events={[FUTURE, ONGOING]}
        now={NOW}
        ongoingLabel="En curso"
        emptyLabel="vacío"
        onPressEvent={() => {}}
      />,
    );
    // Titles render in document order; the ongoing one must appear before the future one.
    const titles = getAllByText(/Futuro|En marcha/).map((n) => n.props.children);
    expect(titles.indexOf('En marcha')).toBeLessThan(titles.indexOf('Futuro'));
  });

  it('shows the empty label when there are no events', () => {
    const { getByText } = render(
      <ManagedEventsScroll
        events={[]}
        now={NOW}
        ongoingLabel="En curso"
        emptyLabel="Aún no gestionas ningún evento"
        onPressEvent={() => {}}
      />,
    );
    expect(getByText('Aún no gestionas ningún evento')).toBeTruthy();
  });

  it('calls onPressEvent with the pressed event when a card is pressed', () => {
    const onPressEvent = jest.fn();
    const { getByText } = render(
      <ManagedEventsScroll
        events={[ONGOING]}
        now={NOW}
        ongoingLabel="En curso"
        emptyLabel="vacío"
        onPressEvent={onPressEvent}
      />,
    );
    fireEvent.press(getByText('En marcha'));
    expect(onPressEvent).toHaveBeenCalledWith(ONGOING);
  });
});
