import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';
import { GroupSectionBody, sectionScrollsItself } from '../GroupSectionBody';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/hooks/useWatch', () => ({ useWatch: () => ({ data: [], status: 'ready' }) }));
jest.mock('@cultuvilla/shared/services/orgMemberService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/orgMemberService')>('@cultuvilla/shared/services/orgMemberService'),
);

function mockStub(testID: string) {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return () => <RNText testID={testID} />;
}
jest.mock('../SociosRoster', () => ({ SociosRoster: mockStub('roster') }));
jest.mock('../MySocioRecord', () => ({ MySocioRecord: mockStub('personas') }));
jest.mock('../JuntaDirectiva', () => ({ JuntaDirectiva: mockStub('junta'), AddToJuntaButton: mockStub('add-junta') }));
jest.mock('../AddSocioButton', () => ({ AddSocioButton: mockStub('add-socio') }));
jest.mock('../SocioConsentCard', () => ({ SocioConsentCard: mockStub('consent') }));
jest.mock('../../OrgJoinRequests', () => ({ OrgJoinRequests: mockStub('requests') }));
jest.mock('../../OrgMembersList', () => ({ OrgMembersList: () => null }));
jest.mock('../CuotaAdmin', () => ({ CuotaAdmin: () => null }));
jest.mock('../GroupMessagesAdmin', () => ({ GroupMessagesAdmin: () => null }));
jest.mock('../GroupNotices', () => ({ GroupNotices: mockStub('notices') }));
jest.mock('../SocioAvisoComposer', () => ({ SocioAvisoComposer: mockStub('socio-aviso') }));
jest.mock('../TransparentAvisos', () => ({ TransparentAvisos: mockStub('all-avisos') }));
jest.mock('../TransparentCuota', () => ({ TransparentCuota: mockStub('cuota-list') }));
jest.mock('../GroupAccounts', () => ({ GroupAccounts: mockStub('accounts') }));
jest.mock('../GroupSettings', () => ({ GroupSettings: () => null }));
jest.mock('../MyActas', () => ({ MyActas: () => null }));
jest.mock('../MyCuota', () => ({ MyCuota: mockStub('my-cuota') }));
jest.mock('../ActasAdmin', () => ({
  ActasAdmin: ({ header }: { header?: ReactNode }) => {
    const { Text: RNText, View } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <View>
        {header}
        <RNText testID="actas-admin" />
      </View>
    );
  },
}));
jest.mock('../AsambleaChecklist', () => ({ AsambleaChecklist: mockStub('asamblea') }));
jest.mock('../YearSummaryAdmin', () => ({ YearSummaryAdmin: mockStub('year-admin') }));
jest.mock('../LibroDoor', () => ({ LibroDoor: mockStub('libro-door') }));

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

  it('always shows an admin the list, the join requests and the libro', () => {
    const { getByTestId, queryByTestId } = renderSocios('admin', false);
    expect(getByTestId('libro-door')).toBeTruthy();
    expect(getByTestId('roster')).toBeTruthy();
    expect(getByTestId('requests')).toBeTruthy();
    expect(getByTestId('personas')).toBeTruthy();
    expect(queryByTestId('socios-list-hidden')).toBeNull();
  });

  it('orders an admin\'s screen: ficha, consent, requests, libro, Añadir socio beside Añadir a la junta, junta, list', () => {
    const { toJSON } = renderSocios('admin', false);
    const ids = JSON.stringify(toJSON()).match(/"testID":"[a-z-]+"/g)?.map((m) => m.slice(10, -1)) ?? [];
    const order = ['personas', 'consent', 'requests', 'libro-door', 'add-socio', 'add-junta', 'junta', 'roster'];
    expect(ids.filter((id) => order.includes(id))).toEqual(order);
  });

  it('gives a member the Añadir socio button too', () => {
    expect(renderSocios('member', true).getByTestId('add-socio')).toBeTruthy();
  });
});

describe('the same button, more inside for an admin', () => {
  function renderAs(role: 'admin' | 'member', section: 'actas' | 'cuentas') {
    const group = { org: { id: 'org1', name: 'Peña', type: 'peña', transparency: { cuota: false, avisos: false, cuentas: true } }, role } as unknown as MyGroup;
    return render(<GroupSectionBody group={group} section={section} uid="u1" />);
  }

  it('opens the editable actas, with the asamblea checklist, for an admin', () => {
    const { getByTestId } = renderAs('admin', 'actas');
    expect(getByTestId('asamblea')).toBeTruthy();
    expect(getByTestId('actas-admin')).toBeTruthy();
    expect(renderAs('member', 'actas').queryByTestId('actas-admin')).toBeNull();
  });

  it("lets only an admin's actas and cuentas scroll themselves, for their floating button", () => {
    expect(sectionScrollsItself('actas', true)).toBe(true);
    expect(sectionScrollsItself('cuentas', true)).toBe(true);
    expect(sectionScrollsItself('actas', false)).toBe(false);
    expect(sectionScrollsItself('socios', true)).toBe(false);
  });

  it('opens the editable accounts for an admin and the shared ones for a socio', () => {
    expect(renderAs('admin', 'cuentas').getByTestId('year-admin')).toBeTruthy();
    expect(renderAs('member', 'cuentas').getByTestId('accounts')).toBeTruthy();
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

describe('a socio sends an aviso where the junta lets them', () => {
  function renderAvisos(org: Record<string, unknown>, role: 'admin' | 'member' = 'member') {
    const group = {
      org: { id: 'org1', name: 'Peña', type: 'peña', transparency: { cuota: false, avisos: false, cuentas: false }, sociosSendAvisos: false, ...org },
      role,
    } as unknown as MyGroup;
    return render(<GroupSectionBody group={group} section="avisos" uid="u1" />);
  }

  it('offers nothing to send while the setting is off', () => {
    const { getByTestId, queryByTestId } = renderAvisos({});
    expect(queryByTestId('socio-aviso')).toBeNull();
    expect(getByTestId('notices')).toBeTruthy();
  });

  it('puts the composer above the avisos once it is on, private or public', () => {
    const on = renderAvisos({ sociosSendAvisos: true });
    expect(on.getByTestId('socio-aviso')).toBeTruthy();
    expect(on.getByTestId('notices')).toBeTruthy();
    on.unmount();
    const open = renderAvisos({ sociosSendAvisos: true, transparency: { cuota: false, avisos: true, cuentas: false } });
    expect(open.getByTestId('socio-aviso')).toBeTruthy();
    expect(open.getByTestId('all-avisos')).toBeTruthy();
  });

  it('leaves the junta its own composer, and a group without socios none', () => {
    expect(renderAvisos({ sociosSendAvisos: true }, 'admin').queryByTestId('socio-aviso')).toBeNull();
    expect(renderAvisos({ sociosSendAvisos: true, type: 'ayuntamiento' }).queryByTestId('socio-aviso')).toBeNull();
  });
});
