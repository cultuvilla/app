import { fireEvent, render } from '@testing-library/react-native';
import { resolveNotificationSettings } from '@cultuvilla/shared/models/notification';
import { setWatched } from '../../../test/watchers';
import NotificationSettingsScreen from '../notificaciones';
import type { NotificationAudience } from '../../../lib/notifications/useNotificationAudience';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));

const mockPermission = { current: 'granted' };
jest.mock('../../../lib/push/PushProvider', () => ({
  usePush: () => ({
    permission: mockPermission.current,
    refreshPermission: jest.fn(() => Promise.resolve()),
    requestPermission: jest.fn(() => Promise.resolve()),
  }),
}));
jest.mock('../../../lib/push/pushClient', () => ({ openPushSettings: jest.fn() }));

const mockSave = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('@cultuvilla/shared/services/notificationService', () => ({
  watchNotificationSettings: jest.requireActual<typeof import('../../../test/watchers')>('../../../test/watchers').mockWatcher('settings'),
  saveNotificationSettings: (...args: unknown[]) => mockSave(...args),
}));

const mockConfirm = jest.fn();
jest.mock('../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: (...args: unknown[]) => mockConfirm(...args),
}));

const audience: { current: NotificationAudience } = {
  current: { status: 'ready', groups: [], villages: [], handlesRequests: false },
};
jest.mock('../../../lib/notifications/useNotificationAudience', () => ({
  useNotificationAudience: () => audience.current,
}));

const group = (id: string, name: string) => ({ org: { id, name }, role: 'member' }) as unknown as NotificationAudience['groups'][number];

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermission.current = 'granted';
    audience.current = { status: 'ready', groups: [], villages: [], handlesRequests: false };
    setWatched('settings', resolveNotificationSettings(null, null));
  });

  it('shows one switch per topic that can reach the person, all on by default', () => {
    const { getByTestId, queryByTestId } = render(<NotificationSettingsScreen />);
    expect(getByTestId('push-topic-village_news').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('push-topic-cosateca_reservas')).toBeTruthy();
    expect(queryByTestId('push-topic-group_tasks')).toBeNull();
    expect(queryByTestId('push-per-group')).toBeNull();
    // A persona's responsible member gets cuota reminders without being in the group.
    expect(getByTestId('push-topic-group_cuotas')).toBeTruthy();
    expect(queryByTestId('push-topic-requests_to_handle')).toBeNull();
    expect(queryByTestId('push-per-village')).toBeNull();
  });

  it('shows the group switches and a link to each group once the person is in one', () => {
    audience.current = { ...audience.current, groups: [group('org1', 'Peña El Trago')], handlesRequests: true };
    const { getByTestId } = render(<NotificationSettingsScreen />);
    expect(getByTestId('push-section-groups')).toBeTruthy();
    expect(getByTestId('push-topic-group_tasks')).toBeTruthy();
    expect(getByTestId('push-topic-requests_to_handle')).toBeTruthy();
    expect(getByTestId('push-per-group')).toBeTruthy();
    fireEvent.press(getByTestId('push-group-org1'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/org1/ajustes');
  });

  it('mutes a topic straight away', () => {
    const { getByTestId } = render(<NotificationSettingsScreen />);
    fireEvent.press(getByTestId('push-topic-village_news'));
    expect(mockSave).toHaveBeenCalledWith('u1', { mutedTopics: ['village_news'], mutedVillages: [], quietHours: true });
  });

  it('keeps both of two quick taps, whatever the snapshot still says', () => {
    const { getByTestId } = render(<NotificationSettingsScreen />);
    fireEvent.press(getByTestId('push-topic-village_news'));
    fireEvent.press(getByTestId('push-topic-cosateca_chat'));
    expect(mockSave).toHaveBeenLastCalledWith('u1', {
      mutedTopics: ['village_news', 'cosateca_chat'],
      mutedVillages: [],
      quietHours: true,
    });
    expect(getByTestId('push-topic-village_news').props.accessibilityState.checked).toBe(false);
  });

  it('says so when the switches cannot be read, instead of spinning', () => {
    setWatched('settings', new Error('permission-denied'));
    const { queryByTestId } = render(<NotificationSettingsScreen />);
    expect(queryByTestId('push-topic-village_news')).toBeNull();
  });

  it('asks before muting the person’s own events', () => {
    const { getByTestId } = render(<NotificationSettingsScreen />);
    fireEvent.press(getByTestId('push-topic-event_seats'));
    expect(mockSave).not.toHaveBeenCalled();
    const onConfirm = mockConfirm.mock.calls[0][2] as () => void;
    onConfirm();
    expect(mockSave).toHaveBeenCalledWith('u1', { mutedTopics: ['event_seats'], mutedVillages: [], quietHours: true });
  });

  it('turns a muted topic back on without asking', () => {
    setWatched('settings', { ...resolveNotificationSettings(null, null), mutedTopics: new Set(['event_seats']) });
    const { getByTestId } = render(<NotificationSettingsScreen />);
    fireEvent.press(getByTestId('push-topic-event_seats'));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledWith('u1', { mutedTopics: [], mutedVillages: [], quietHours: true });
  });

  it('lets someone in two pueblos mute one of them', () => {
    audience.current = {
      ...audience.current,
      villages: [{ municipalityId: 'm1', name: 'Matabuena' }, { municipalityId: 'm2', name: 'Madrid' }],
    };
    const { getByTestId } = render(<NotificationSettingsScreen />);
    expect(getByTestId('push-per-village')).toBeTruthy();
    fireEvent.press(getByTestId('push-village-m2'));
    expect(mockSave).toHaveBeenCalledWith('u1', { mutedTopics: [], mutedVillages: ['m2'], quietHours: true });
  });

  it('locks every switch while the phone refuses notifications', () => {
    mockPermission.current = 'denied';
    const { getByTestId } = render(<NotificationSettingsScreen />);
    expect(getByTestId('push-permission-denied')).toBeTruthy();
    expect(getByTestId('push-topic-village_news').props.accessibilityState.disabled).toBe(true);
  });
});
