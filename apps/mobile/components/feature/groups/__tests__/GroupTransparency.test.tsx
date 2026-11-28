import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { buildLedgerEntryData } from '@cultuvilla/shared/models/organization';
import {
  fetchTransparentAvisos,
  fetchTransparentCuota,
  fetchTransparentCuotaIncome,
} from '@cultuvilla/shared/services/groupTransparencyService';
import { updateOrganization } from '@cultuvilla/shared/services/organizationService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupAccounts } from '../GroupAccounts';
import { GroupSettings } from '../GroupSettings';
import { TransparentAvisos } from '../TransparentAvisos';
import { TransparentCuota } from '../TransparentCuota';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('../../../../lib/orgs/cuota', () => ({
  ...jest.requireActual('../../../../lib/orgs/cuota'),
  todayKey: () => '2026-04-01',
}));
jest.mock('@cultuvilla/shared/services/groupTransparencyService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/groupTransparencyService')>('@cultuvilla/shared/services/groupTransparencyService'),
);
jest.mock('@cultuvilla/shared/services/organizationService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/organizationService')>('@cultuvilla/shared/services/organizationService', () => ({
      updateOrganization: async () => undefined,
    })),
);
jest.mock('@cultuvilla/shared/services/cuotaService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/cuotaService')>('@cultuvilla/shared/services/cuotaService', () => ({
      watchCuotaSettings: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('cuota'),
    })),
);
jest.mock('@cultuvilla/shared/services/recordsService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/recordsService')>('@cultuvilla/shared/services/recordsService', () => ({
      watchLedgerEntriesForYear: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('ledger'),
    })),
);
jest.mock('@cultuvilla/shared/services/groupMessageService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/groupMessageService')>('@cultuvilla/shared/services/groupMessageService', () => {
      const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
      return { watchMyGroupMessages: mockWatcher('messages'), watchMyGroupMessageReads: mockWatcher('reads') };
    }),
);
const mockNotices = jest.fn();
jest.mock('../GroupNotices', () => ({
  GroupNotices: (props: { tallies?: ReadonlyMap<string, readonly number[]>; empty?: ReactNode }) => {
    mockNotices(props);
    return null;
  },
}));

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  setWatched('cuota', null);
});

describe('GroupSettings — sections', () => {
  it('groups a roster group\'s settings under one heading per question', () => {
    setWatched('cuota', { id: 'cuota', remindersEnabled: true });
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible />);
    const ids = ['group-settings-features', 'group-settings-entry', 'group-settings-transparency', 'group-settings-charla', 'group-settings-cuota'];
    for (const id of ids) expect(r.getByTestId(id)).toBeTruthy();
    for (const k of ['features', 'entry', 'membersCan.socios', 'tools']) expect(r.getByText(`groups.settings.sections.${k}`)).toBeTruthy();
    // What the group uses comes first.
    const order = r.getAllByTestId(/^group-settings-(features|entry|transparency|charla|cuota)$/).map((el) => el.props.testID as string);
    expect(order).toEqual(ids);
    expect(r.getByText('groups.transparency.settings.title')).toBeTruthy();
  });

  it('switches the cuota off, and with it its reminders and its public list', () => {
    setWatched('cuota', { id: 'cuota', remindersEnabled: true });
    const on = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible />);
    fireEvent.press(on.getByTestId('group-settings-cuota-enabled'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { cuotaEnabled: false });
    on.unmount();
    const off = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible cuotaEnabled={false} />);
    expect(off.getByTestId('group-settings-cuota-enabled').props.accessibilityState).toMatchObject({ checked: false });
    expect(off.queryByTestId('group-settings-cuota')).toBeNull();
    expect(off.queryByTestId('group-settings-transparency-cuota')).toBeNull();
    expect(off.getByTestId('group-settings-transparency-cuentas')).toBeTruthy();
  });

  it('switches the actas and the cuentas off, the cuentas taking their public view with them', () => {
    const actas = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible />);
    fireEvent.press(actas.getByTestId('group-settings-actas-enabled'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { actasEnabled: false });
    actas.unmount();
    const cuentas = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible />);
    fireEvent.press(cuentas.getByTestId('group-settings-cuentas-enabled'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { cuentasEnabled: false });
    cuentas.unmount();
    const off = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible cuentasEnabled={false} />);
    expect(off.getByTestId('group-settings-cuentas-enabled').props.accessibilityState).toMatchObject({ checked: false });
    expect(off.queryByTestId('group-settings-transparency-cuentas')).toBeNull();
  });

  it('gives an ayuntamiento no entry or socio sections, and no cuota switch', () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} hasRoster={false} isAyuntamiento />);
    expect(r.queryByTestId('group-settings-entry')).toBeNull();
    expect(r.queryByTestId('group-settings-join-policy')).toBeNull();
    expect(r.getByTestId('group-settings-charla')).toBeTruthy();
    expect(r.getByText('groups.settings.sections.membersCan.integrantes')).toBeTruthy();
    expect(r.queryByText('groups.settings.sections.membersCan.socios')).toBeNull();
    expect(r.queryByTestId('group-settings-cuota-enabled')).toBeNull();
    expect(r.getByTestId('group-settings-cosateca')).toBeTruthy();
  });

  it('warns before opening the group, and opens it once confirmed', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} hasRoster={false} />);
    fireEvent.press(r.getByTestId('group-settings-join-policy'));
    expect(alert).toHaveBeenCalledWith('organization.joinPolicy.switchToOpenTitle', 'organization.joinPolicy.switchToOpenBody', expect.any(Array));
    expect(updateOrganization).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0]![2]!;
    act(() => buttons[buttons.length - 1]!.onPress!());
    expect(updateOrganization).toHaveBeenCalledWith('org1', { joinPolicy: 'open' });
    alert.mockRestore();
  });

  it('closes an open group without asking', () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} joinPolicy="open" />);
    fireEvent.press(r.getByTestId('group-settings-join-policy'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { joinPolicy: 'approval' });
  });
});

describe('GroupSettings — what socios can do', () => {
  it('shows the Charla switch on while socios may write, and saves its inverse', () => {
    const open = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    const write = open.getByTestId('group-settings-chat-admins-only');
    expect(write.props.accessibilityState).toMatchObject({ checked: true });
    expect(open.getByText('groups.settings.chatMembersWrite')).toBeTruthy();
    fireEvent.press(write);
    expect(updateOrganization).toHaveBeenCalledWith('org1', { chatAdminsOnly: true });
    open.unmount();
    const closed = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} chatAdminsOnly />);
    expect(closed.getByTestId('group-settings-chat-admins-only').props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(closed.getByTestId('group-settings-chat-admins-only'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { chatAdminsOnly: false });
  });

  it('lets the junta open avisos to its socios, off until it does, and only where there are socios', () => {
    const off = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    const send = off.getByTestId('group-settings-socios-send-avisos');
    expect(send.props.accessibilityState).toMatchObject({ checked: false });
    expect(off.getByText('groups.settings.sociosSendAvisos')).toBeTruthy();
    fireEvent.press(send);
    expect(updateOrganization).toHaveBeenCalledWith('org1', { sociosSendAvisos: true });
    off.unmount();
    const on = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} sociosSendAvisos />);
    fireEvent.press(on.getByTestId('group-settings-socios-send-avisos'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { sociosSendAvisos: false });
    on.unmount();
    const noRoster = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} hasRoster={false} />);
    expect(noRoster.queryByTestId('group-settings-socios-send-avisos')).toBeNull();
  });

  it('carries no hint under any switch', () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    expect(r.queryByText(/Hint$|\.hint$/)).toBeNull();
  });
});

describe('GroupSettings — what every socio sees', () => {
  it('offers the three switches, off by default, labelled to read alone, only where there are socios', () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    for (const view of ['cuota', 'avisos', 'cuentas']) {
      expect(r.getByTestId(`group-settings-transparency-${view}`).props.accessibilityState).toMatchObject({ checked: false });
      expect(r.getByText(`groups.transparency.settings.${view}`)).toBeTruthy();
    }
    r.unmount();
    const ayto = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} hasRoster={false} />);
    expect(ayto.queryByTestId('group-settings-transparency')).toBeNull();
  });

  it('turns one on and keeps the others as they are', () => {
    const r = render(
      <GroupSettings orgId="org1" uid="u1" sociosListVisible={false} transparency={{ cuota: true, avisos: false, cuentas: false }} />,
    );
    fireEvent.press(r.getByTestId('group-settings-transparency-cuentas'));
    expect(updateOrganization).toHaveBeenCalledWith('org1', { transparency: { cuota: true, avisos: false, cuentas: true } });
  });
});

describe('TransparentCuota', () => {
  it('lists each socio with their name and al día / pendiente, and nothing about money', async () => {
    jest.mocked(fetchTransparentCuota).mockResolvedValue({
      view: 'cuota',
      periodKey: '2026',
      socios: [
        { socioId: 'a', displayName: 'Ana', status: 'pendiente' },
        { socioId: 'l', displayName: 'Luis', status: 'al_dia' },
      ],
    });
    const r = render(<TransparentCuota orgId="org1" />);
    await waitFor(() => expect(r.getByTestId('transparent-cuota')).toBeTruthy());
    expect(fetchTransparentCuota).toHaveBeenCalledWith('org1');
    expect(r.getByTestId('transparent-cuota-row-a')).toBeTruthy();
    expect(r.getByText('Ana')).toBeTruthy();
    expect(r.getByText('groups.transparency.cuota.status.pendiente')).toBeTruthy();
    expect(r.getByText('groups.transparency.cuota.status.al_dia')).toBeTruthy();
    expect(r.getByTestId('transparent-cuota-summary')).toBeTruthy();
    expect(r.queryByText(/€/)).toBeNull();
  });

  it('shows nothing before the cuota is configured, and says so when it cannot load', async () => {
    jest.mocked(fetchTransparentCuota).mockResolvedValueOnce({ view: 'cuota', periodKey: null, socios: [] });
    const none = render(<TransparentCuota orgId="org1" />);
    await waitFor(() => expect(fetchTransparentCuota).toHaveBeenCalled());
    expect(none.queryByTestId('transparent-cuota')).toBeNull();
    none.unmount();
    jest.mocked(fetchTransparentCuota).mockRejectedValueOnce(new Error('permission-denied'));
    const failed = render(<TransparentCuota orgId="org1" />);
    await waitFor(() => expect(failed.getByTestId('transparent-cuota-error')).toBeTruthy());
  });
});

describe('TransparentAvisos', () => {
  const aviso = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: `T-${id}`, body: `B-${id}`, audienceKind: 'cuota' as const, eventTitle: null, signerName: 'Luis', signerTitle: null,
    sentAt: '2026-03-20T10:00:00.000Z', poll: null, tally: null, ...over,
  });

  it("keeps the member's own notices and adds every other aviso, with its poll results", async () => {
    setWatched('messages', [{ id: 'mine', sentAt: new Date('2026-03-01'), sentBy: 'admin' }]);
    setWatched('reads', []);
    const poll = { question: '¿Cena?', kind: 'yes_no' as const, options: ['Sí', 'No'] };
    jest.mocked(fetchTransparentAvisos).mockResolvedValue({
      view: 'avisos',
      avisos: [aviso('mine', { poll, tally: [1, 0] }), aviso('other', { poll, tally: [2, 3] })],
    });
    const r = render(<TransparentAvisos orgId="org1" uid="u1" />);
    await waitFor(() => expect(r.getByTestId('transparent-aviso-other')).toBeTruthy());
    expect(r.getByTestId('transparent-avisos')).toBeTruthy();
    expect(r.queryByTestId('transparent-aviso-mine')).toBeNull();
    expect(r.getByText('T-other')).toBeTruthy();
    expect(r.getByTestId('transparent-aviso-results-other')).toBeTruthy();
    expect(r.getByText('groups.transparency.avisos.votes:3')).toBeTruthy();
    expect(r.getByText(/groups\.transparency\.avisos\.audience\.cuota/)).toBeTruthy();
    const { tallies } = mockNotices.mock.calls.at(-1)?.[0] as { tallies: ReadonlyMap<string, number[]> };
    expect(tallies.get('mine')).toEqual([1, 0]);
  });

  it('shows the empty state when the junta sent nothing, and an error when it cannot load', async () => {
    setWatched('messages', []);
    jest.mocked(fetchTransparentAvisos).mockResolvedValueOnce({ view: 'avisos', avisos: [] });
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const empty = render(<TransparentAvisos orgId="org1" uid="u1" empty={<Text testID="empty" />} />);
    await waitFor(() => expect(empty.getByTestId('empty')).toBeTruthy());
    empty.unmount();
    jest.mocked(fetchTransparentAvisos).mockRejectedValueOnce(new Error('x'));
    const failed = render(<TransparentAvisos orgId="org1" uid="u1" />);
    await waitFor(() => expect(failed.getByTestId('transparent-avisos-error')).toBeTruthy());
  });
});

describe('GroupAccounts', () => {
  const entry = (id: string, over: Partial<Parameters<typeof buildLedgerEntryData>[0]> = {}) => ({
    id,
    ...buildLedgerEntryData({ kind: 'expense', amountCents: 12000, on: '2026-02-01', concept: `C-${id}`, category: null, recordedBy: 'a', ...over }),
  });

  it("adds the cuota's totals to the ledger, read-only, and moves between years", async () => {
    setWatched('ledger', [entry('e1'), entry('e2', { kind: 'income', amountCents: 5000, concept: 'Rifa' })]);
    jest.mocked(fetchTransparentCuotaIncome).mockResolvedValue({
      view: 'cuentas', year: '2026', cuotaByPeriod: [{ periodKey: '2026', cents: 9000 }], cuotaCents: 9000,
    });
    const r = render(<GroupAccounts orgId="org1" />);
    await waitFor(() => expect(r.getByTestId('group-accounts-totals')).toBeTruthy());
    expect(r.getByTestId('group-accounts')).toBeTruthy();
    expect(fetchTransparentCuotaIncome).toHaveBeenCalledWith('org1', '2026');
    // 90 € cuotas + 50 € rifa − 120 € gastos.
    expect(r.getByTestId('group-accounts-balance').props.children).toMatch(/20/);
    expect(r.getByTestId('group-accounts-entry-e1')).toBeTruthy();
    expect(r.queryByTestId('ledger-add')).toBeNull();
    expect(r.queryByTestId('ledger-reverse-e1')).toBeNull();
    expect(r.getByTestId('group-accounts-next').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(r.getByTestId('group-accounts-prev'));
    await waitFor(() => expect(r.getByTestId('group-accounts-year').props.children).toBe('2025'));
    expect(fetchTransparentCuotaIncome).toHaveBeenLastCalledWith('org1', '2025');
  });

  it('says so when it cannot load', async () => {
    setWatched('ledger', []);
    jest.mocked(fetchTransparentCuotaIncome).mockRejectedValue(new Error('permission-denied'));
    const r = render(<GroupAccounts orgId="org1" />);
    await waitFor(() => expect(r.getByTestId('group-accounts-error')).toBeTruthy());
  });
});
