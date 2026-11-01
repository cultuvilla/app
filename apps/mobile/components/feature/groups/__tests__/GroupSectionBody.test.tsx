import { render } from '@testing-library/react-native';
import { GroupSectionBody } from '../GroupSectionBody';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/hooks/useWatch', () => ({ useWatch: () => ({ data: [], status: 'ready' }) }));
jest.mock('@cultuvilla/shared/services/orgMemberService', () => ({ watchOrgMembers: jest.fn() }));

function mockStub(testID: string) {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return () => <RNText testID={testID} />;
}
jest.mock('../SociosRoster', () => ({ SociosRoster: mockStub('roster') }));
jest.mock('../MyPersonasSocios', () => ({ MyPersonasSocios: mockStub('personas') }));
jest.mock('../SocioConsentCard', () => ({ SocioConsentCard: mockStub('consent') }));
jest.mock('../../OrgJoinRequests', () => ({ OrgJoinRequests: mockStub('requests') }));
jest.mock('../../OrgMembersList', () => ({ OrgMembersList: () => null }));
jest.mock('../CuotaAdmin', () => ({ CuotaAdmin: () => null }));
jest.mock('../GroupMessagesAdmin', () => ({ GroupMessagesAdmin: () => null }));
jest.mock('../GroupNotices', () => ({ GroupNotices: () => null }));
jest.mock('../GroupSettings', () => ({ GroupSettings: () => null }));
jest.mock('../MyActas', () => ({ MyActas: () => null }));
jest.mock('../MyCuota', () => ({ MyCuota: () => null }));
jest.mock('../RecordsAdmin', () => ({ RecordsAdmin: () => null }));

function renderSocios(role: 'admin' | 'member', sociosListVisible: boolean) {
  const group = { org: { id: 'org1', name: 'Peña', type: 'pena', sociosListVisible }, role } as unknown as MyGroup;
  return render(<GroupSectionBody group={group} section="socios" uid="u1" />);
}

describe('the Socios screen', () => {
  it('gives a member their consent and personas without the list while the estatutos hide it', () => {
    const { getByTestId, queryByTestId } = renderSocios('member', false);
    expect(getByTestId('consent')).toBeTruthy();
    expect(getByTestId('personas')).toBeTruthy();
    expect(getByTestId('socios-list-hidden')).toBeTruthy();
    expect(queryByTestId('roster')).toBeNull();
    expect(queryByTestId('requests')).toBeNull();
  });

  it('adds the list once the estatutos show it', () => {
    const { getByTestId, queryByTestId } = renderSocios('member', true);
    expect(getByTestId('roster')).toBeTruthy();
    expect(queryByTestId('socios-list-hidden')).toBeNull();
  });

  it('always shows an admin the list and the join requests', () => {
    const { getByTestId, queryByTestId } = renderSocios('admin', false);
    expect(getByTestId('roster')).toBeTruthy();
    expect(getByTestId('requests')).toBeTruthy();
    expect(getByTestId('personas')).toBeTruthy();
    expect(queryByTestId('socios-list-hidden')).toBeNull();
  });
});
