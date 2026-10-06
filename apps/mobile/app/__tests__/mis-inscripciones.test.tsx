import { fireEvent, render, waitFor } from '@testing-library/react-native';
import MyRegistrationsScreen from '../mis-inscripciones';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../test/watchers';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../lib/auth/useAuth', () => {
  const value = { user: { uid: 'u1' } };
  return { useAuth: () => value };
});
jest.mock('../../lib/firestoreErrorLog', () => ({ reportFirestoreError: jest.fn() }));
jest.mock('../../components/feature/EventCard', () => {
  const { Text } = require('react-native');
  return { EventCard: ({ event }: { event: { title: string } }) => <Text>{event.title}</Text> };
});
jest.mock('@cultuvilla/shared/services/registrationService', () => ({
  watchUserRegistrationsAcrossEvents: jest
    .requireActual<typeof import('../../test/watchers')>('../../test/watchers')
    .mockWatcher('registrations'),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByIds: jest
    .requireActual<typeof import('../../test/watchers')>('../../test/watchers')
    .mockWatcher('events'),
}));

const DAY = 24 * 60 * 60 * 1000;

function event(id: string, title: string, daysFromNow: number) {
  return {
    id,
    title,
    startDate: new Date(Date.now() + daysFromNow * DAY),
    endDate: null,
    location: null,
    imageURL: null,
    villageCoverImage: null,
    commentCount: 0,
    villageSlug: 'villa',
  };
}

const registration = (id: string, eventId: string) => ({ id, eventPath: `events/${eventId}` });

beforeEach(() => {
  resetWatchers();
  setWatched('registrations', [registration('r1', 'e1'), registration('r2', 'e1'), registration('r3', 'e2')]);
  setWatched('events', [event('e1', 'Verbena', 3), event('e2', 'Romería', -10)]);
});

describe('MyRegistrationsScreen', () => {
  it('watches each registered event once, and lists the upcoming ones', async () => {
    const { getByText, queryByText } = render(<MyRegistrationsScreen />);
    await waitFor(() => expect(getByText('Verbena')).toBeTruthy());
    expect(queryByText('Romería')).toBeNull();
    expect(watchersOf('events')[0]?.args).toEqual([['e1', 'e2']]);
  });

  it('lists past events on their own tab', async () => {
    const { getByText, queryByText } = render(<MyRegistrationsScreen />);
    await waitFor(() => expect(getByText('Verbena')).toBeTruthy());
    fireEvent.press(getByText('me.registrations.tab.past'));
    await waitFor(() => expect(getByText('Romería')).toBeTruthy());
    expect(queryByText('Verbena')).toBeNull();
  });

  // Both reads are live: signing up elsewhere adds the event here without the
  // screen reloading on focus.
  it('follows a new sign-up as the registrations listener delivers it', async () => {
    const { getByText } = render(<MyRegistrationsScreen />);
    await waitFor(() => expect(getByText('Verbena')).toBeTruthy());

    setWatched('events', [event('e1', 'Verbena', 3), event('e2', 'Romería', -10), event('e3', 'Pregón', 1)]);
    emitWatched('registrations', [registration('r1', 'e1'), registration('r3', 'e2'), registration('r4', 'e3')]);

    await waitFor(() => expect(getByText('Pregón')).toBeTruthy());
    expect(watchersOf('events').at(-1)?.args).toEqual([['e1', 'e2', 'e3']]);
    expect(watchersOf('registrations')).toHaveLength(1);
  });

  it('shows the empty state when the user has signed up for nothing', async () => {
    setWatched('registrations', []);
    setWatched('events', []);
    const { getByText } = render(<MyRegistrationsScreen />);
    await waitFor(() => expect(getByText('me.registrations.emptyUpcoming')).toBeTruthy());
  });

  it('offers a retry that resubscribes when the read fails', async () => {
    setWatched('registrations', new Error('unavailable'));
    const { getByText } = render(<MyRegistrationsScreen />);
    await waitFor(() => expect(getByText('common.error.retry')).toBeTruthy());

    setWatched('registrations', [registration('r1', 'e1')]);
    fireEvent.press(getByText('common.error.retry'));

    await waitFor(() => expect(getByText('Verbena')).toBeTruthy());
    expect(watchersOf('registrations')).toHaveLength(2);
  });
});
