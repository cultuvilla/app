import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { addOrgMember, getOrgMembers, isOrgMember } from '@cultuvilla/shared/services/orgMemberService';
import {
  hasPendingOrgJoinRequest,
  requestToJoinOrganization,
} from '@cultuvilla/shared/services/orgJoinRequestService';
import OrgDetailScreen from '../[entidad]/index';
import { emitWatched, resetWatchers, setWatched, watchersOf } from '../../../../test/watchers';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ pueblo: 'villa', entidad: 'pena-la-union_o1' }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/auth/useAuth', () => {
  const value = { user: { uid: 'u2' } };
  return { useAuth: () => value };
});
jest.mock('../../../../lib/auth/RegisterGateContext', () => ({ useRegisterGate: () => ({ requireAuth: jest.fn() }) }));
jest.mock('../../../../lib/auth/useOrgCapabilities', () => ({ useOrgCapabilities: () => ({ canManage: false }) }));
jest.mock('../../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  watchOrganization: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('org'),
}));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({
  isOrgMember: jest.fn().mockResolvedValue(false),
  addOrgMember: jest.fn(),
  getOrgMembers: jest.fn().mockResolvedValue([]),
  getUserOrgIds: jest.fn().mockResolvedValue([]),
}));
jest.mock('@cultuvilla/shared/services/orgJoinRequestService', () => ({
  hasPendingOrgJoinRequest: jest.fn().mockResolvedValue(false),
  requestToJoinOrganization: jest.fn().mockResolvedValue(undefined),
  cancelOrgJoinRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../../components/feature/OrgJoinRequests', () => ({ OrgJoinRequests: () => null }));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getOrgViewLink: () => ({
    url: 'https://x/villa/entidad/pena-la-union_o1',
    path: '/villa/entidad/pena-la-union_o1',
    kind: 'content',
    resource: 'organization',
  }),
}));
jest.mock('../../../../components/feature/EntityComments', () => ({ EntityComments: () => null }));
const mockOrgEventsSection = jest.fn((_props: { orgId: string; includePrivate: boolean }) => null);
jest.mock('../../../../components/feature/OrgEventsSection', () => ({
  OrgEventsSection: (props: { orgId: string; includePrivate: boolean }) => mockOrgEventsSection(props),
}));
jest.mock('@cultuvilla/shared/services/commentsService', () => ({ recordEntityView: jest.fn().mockResolvedValue(undefined) }));

const OPEN_ORG = {
  id: 'o1',
  name: 'Peña La Unión',
  type: 'peña',
  images: [],
  description: 'd',
  municipalityId: 'm1',
  villageSlug: 'villa',
  joinPolicy: 'open',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetWatchers();
  setWatched('org', OPEN_ORG);
});

describe('OrgDetailScreen', () => {
  it('labels the join FAB specifically for a peña', async () => {
    const { getByText, getByTestId } = render(<OrgDetailScreen />);
    await waitFor(() => getByText('Peña La Unión'));
    getByTestId('join-org-fab');
    getByText('organization.joinPeña');
  });

  it('shows an update the moment the listener delivers it, without refetching membership', async () => {
    const { getByText, findByText } = render(<OrgDetailScreen />);
    await waitFor(() => getByText('Peña La Unión'));
    expect(isOrgMember).toHaveBeenCalledTimes(1);
    emitWatched('org', { ...OPEN_ORG, name: 'Peña El Roble' });
    expect(await findByText('Peña El Roble')).toBeTruthy();
    expect(watchersOf('org')).toHaveLength(1);
    expect(isOrgMember).toHaveBeenCalledTimes(1);
    expect(getOrgMembers).toHaveBeenCalledTimes(1);
  });

  it("lists the org's events, public only for a non-member", async () => {
    const { getByText } = render(<OrgDetailScreen />);
    await waitFor(() => getByText('Peña La Unión'));
    expect(mockOrgEventsSection).toHaveBeenLastCalledWith({ orgId: 'o1', includePrivate: false });
  });

  it('never asks a member of an open org for private events, which the rules refuse', async () => {
    (isOrgMember as jest.Mock).mockResolvedValue(true);
    try {
      const { getByText } = render(<OrgDetailScreen />);
      await waitFor(() => getByText('Peña La Unión'));
      await waitFor(() => expect(isOrgMember).toHaveBeenCalled());
      expect(mockOrgEventsSection).not.toHaveBeenCalledWith({ orgId: 'o1', includePrivate: true });
    } finally {
      (isOrgMember as jest.Mock).mockResolvedValue(false);
    }
  });

  it('shows the not-found state once the org is gone', async () => {
    const { getByText, findByText } = render(<OrgDetailScreen />);
    await waitFor(() => getByText('Peña La Unión'));
    emitWatched('org', null);
    expect(await findByText('common.notFound')).toBeTruthy();
  });
});

describe('OrgDetailScreen — join policy', () => {
  const approvalOrg = {
    id: 'o1',
    name: 'Peña La Unión',
    type: 'peña',
    images: [],
    description: 'd',
    municipalityId: 'm1',
    villageSlug: 'villa',
    joinPolicy: 'approval',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (hasPendingOrgJoinRequest as jest.Mock).mockResolvedValue(false);
  });

  it('asks to join an approval org instead of joining it', async () => {
    setWatched('org', approvalOrg);
    const { getByText, getByTestId } = render(<OrgDetailScreen />);
    await waitFor(() => getByText('organization.requestToJoin'));

    fireEvent.press(getByTestId('join-org-fab'));

    await waitFor(() => expect(requestToJoinOrganization).toHaveBeenCalledWith('o1', 'm1', 'u2'));
    expect(addOrgMember).not.toHaveBeenCalled();
  });

  it("shows a member of an approval org its private events too", async () => {
    setWatched('org', approvalOrg);
    (isOrgMember as jest.Mock).mockResolvedValue(true);
    try {
      render(<OrgDetailScreen />);
      await waitFor(() =>
        expect(mockOrgEventsSection).toHaveBeenLastCalledWith({ orgId: 'o1', includePrivate: true }),
      );
    } finally {
      (isOrgMember as jest.Mock).mockResolvedValue(false);
    }
  });

  it('shows a request already sent as pending', async () => {
    setWatched('org', approvalOrg);
    (hasPendingOrgJoinRequest as jest.Mock).mockResolvedValue(true);
    const { getByText } = render(<OrgDetailScreen />);
    await waitFor(() => getByText('organization.requestPending'));
  });
});
