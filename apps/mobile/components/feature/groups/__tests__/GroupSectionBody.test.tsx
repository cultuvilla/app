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
jest.mock('../MySocioRecord', () => ({ MySocioRecord: mockStub('personas') }));
jest.mock('../JuntaDirectiva', () => ({ JuntaDirectiva: mockStub('junta') }));
jest.mock('../SocioConsentCard', () => ({ SocioConsentCard: mockStub('consent') }));
jest.mock('../../OrgJoinRequests', () => ({ OrgJoinRequests: mockStub('requests') }));
jest.mock('../../OrgMembersList', () => ({ OrgMembersList: () => null }));
jest.mock('../CuotaAdmin', () => ({ CuotaAdmin: () => null }));
jest.mock('../GroupMessagesAdmin', () => ({ GroupMessagesAdmin: () => null }));
jest.mock('../GroupNotices', () => ({ GroupNotices: mockStub('notices') }));
jest.mock('../TransparentAvisos', () => ({ TransparentAvisos: mockStub('all-avisos') }));
jest.mock('../TransparentCuota', () => ({ TransparentCuota: mockStub('cuota-list') }));
jest.mock('../GroupAccounts', () => ({ GroupAccounts: mockStub('accounts') }));
jest.mock('../GroupSettings', () => ({ GroupSettings: () => null }));
jest.mock('../MyActas', () => ({ MyActas: () => null }));
jest.mock('../MyCuota', () => ({ MyCuota: mockStub('my-cuota') }));
jest.mock('../RecordsAdmin', () => ({ RecordsAdmin: () => null }));

function renderSocios(role: 'admin' | 'member', sociosListVisible: boolean) {
  const group = { org: { id: 'org1', name: 'Peña', type: 'pena', sociosListVisible }, role } as unknown as MyGroup;
  return render(<GroupSectionBody group={group} section="socios" uid="u1" />);
}

describe('the Socios screen', () => {
  it('gives a member their ficha, consent and the junta without the list while the estatutos hide it', () => {
    const { getByTestId, queryByTestId } = renderSocios('member', false);
    expect(getByTestId('consent')).toBeTruthy();
    expect(getByTestId('personas')).toBeTruthy();
    expect(getByTestId('junta')).toBeTruthy();
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

describe('what the junta makes public', () => {
  const OFF = { cuota: false, avisos: false, cuentas: false };
  function renderSection(section: 'avisos' | 'cuota' | 'cuentas', transparency = OFF) {
    const group = { org: { id: 'org1', name: 'Peña', type: 'peña', transparency }, role: 'member' } as unknown as MyGroup;
    return render(<GroupSectionBody group={group} section={section} uid="u1" />);
  }

  it('shows a member only their own avisos and cuota while the switches are off', () => {
    const avisos = renderSection('avisos');
    expect(avisos.getByTestId('notices')).toBeTruthy();
    expect(avisos.queryByTestId('all-avisos')).toBeNull();
    avisos.unmount();
    const cuota = renderSection('cuota');
    expect(cuota.getByTestId('my-cuota')).toBeTruthy();
    expect(cuota.queryByTestId('cuota-list')).toBeNull();
  });

  it('adds every aviso, and the cuota list below their own, once each is on', () => {
    const avisos = renderSection('avisos', { ...OFF, avisos: true });
    expect(avisos.getByTestId('all-avisos')).toBeTruthy();
    expect(avisos.queryByTestId('notices')).toBeNull();
    avisos.unmount();
    const cuota = renderSection('cuota', { ...OFF, cuota: true });
    expect(cuota.getByTestId('my-cuota')).toBeTruthy();
    expect(cuota.getByTestId('cuota-list')).toBeTruthy();
  });

  it('opens the accounts on their own screen', () => {
    expect(renderSection('cuentas', { ...OFF, cuentas: true }).getByTestId('accounts')).toBeTruthy();
  });
});
