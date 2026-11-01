import { render } from '@testing-library/react-native';
import { resetWatchers, setWatched } from '../../../../../test/watchers';
import { markGroupMessageRead } from '@cultuvilla/shared/services/groupMessageService';
import GroupAvisoScreen from '../[aviso]';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
let mockGroups: { org: { id: string; municipalityId: string }; role: string }[] = [];
jest.mock('../../../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../../../lib/orgs/useMyMessageValues', () => ({
  useMyMessageValues: () => ({ nombre: 'Ana', numero: null, cuotaCents: null }),
}));
jest.mock('@cultuvilla/shared/services/groupChatService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../../test/watchers')>('../../../../../test/watchers');
  return { watchGroupAviso: mockWatcher('aviso') };
});
let mockNotices = { notices: [] as { id: string; sentBy: string }[], readIds: new Set<string>(), readsStatus: 'ready' };
jest.mock('../../../../../lib/orgs/useGroupNotices', () => ({ useGroupNotices: () => mockNotices }));
jest.mock('@cultuvilla/shared/services/groupMessageService', () => ({ markGroupMessageRead: jest.fn().mockResolvedValue(undefined) }));
const mockChatProps = jest.fn();
jest.mock('../../../../../components/feature/groups/GroupChat', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GroupChat: (props: { head: React.ReactNode; threadId: string; canModerate: boolean }) => {
      mockChatProps(props);
      return <View testID="chat">{props.head}</View>;
    },
  };
});
jest.mock('../../../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('../../../../../lib/firestoreErrorLog', () => ({ reportWatchError: jest.fn(), reportWatchStall: jest.fn() }));
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    mockRedirect(href);
    return null;
  },
  useLocalSearchParams: () => ({ grupo: 'org1', aviso: 'm1' }),
}));

const aviso = {
  id: 'm1', title: 'Asamblea', body: 'Hola {nombre}', signerName: 'Luis', sentAt: new Date('2026-11-01T10:00:00Z'), recipientUids: ['u1'], sentBy: 'u-luis',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchers();
  mockGroups = [{ org: { id: 'org1', municipalityId: 'mun1' }, role: 'member' }];
  mockNotices = { notices: [], readIds: new Set(), readsStatus: 'ready' };
});

describe('GroupAvisoScreen', () => {
  it('draws the aviso, personalized, as the head of its thread', () => {
    setWatched('aviso', aviso);
    const r = render(<GroupAvisoScreen />);
    expect(r.getByTestId('group-aviso-head')).toBeTruthy();
    expect(r.getByText('Asamblea')).toBeTruthy();
    expect(r.getByText('Hola Ana')).toBeTruthy();
    expect(mockChatProps).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'm1', orgId: 'org1', municipalityId: 'mun1', canModerate: false }));
  });

  it('shows only its date under the text, and opening it marks it read', () => {
    setWatched('aviso', aviso);
    mockNotices = { ...mockNotices, notices: [{ id: 'm1', sentBy: 'u-luis' }] };
    const r = render(<GroupAvisoScreen />);
    expect(r.getByTestId('group-aviso-head')).not.toHaveTextContent(/Luis|sentBy/);
    expect(markGroupMessageRead).toHaveBeenCalledWith('org1', 'm1', 'u1');
  });

  it('marks nothing when it is already read, sent by the viewer, or sent to others', () => {
    setWatched('aviso', aviso);
    for (const state of [
      { notices: [{ id: 'm1', sentBy: 'u-luis' }], readIds: new Set(['m1']) },
      { notices: [{ id: 'm1', sentBy: 'u1' }], readIds: new Set<string>() },
      { notices: [], readIds: new Set<string>() },
    ]) {
      mockNotices = { ...state, readsStatus: 'ready' };
      render(<GroupAvisoScreen />).unmount();
    }
    expect(markGroupMessageRead).not.toHaveBeenCalled();
  });

  it('says so when the rules refuse it or it does not exist', () => {
    setWatched('aviso', new Error('permission-denied'));
    const refused = render(<GroupAvisoScreen />);
    expect(refused.getByTestId('group-aviso-unavailable')).toBeTruthy();
    refused.unmount();
    setWatched('aviso', null);
    expect(render(<GroupAvisoScreen />).getByTestId('group-aviso-unavailable')).toBeTruthy();
    expect(mockChatProps).not.toHaveBeenCalled();
  });

  it('sends someone who is not in the group back to the tab', () => {
    mockGroups = [];
    render(<GroupAvisoScreen />);
    expect(mockRedirect).toHaveBeenCalled();
  });
});
