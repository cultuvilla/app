import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
jest.mock('@cultuvilla/shared/services/groupTransparencyService', () => ({
  fetchTransparentCuota: jest.fn(),
  fetchTransparentAvisos: jest.fn(),
  fetchTransparentCuotaIncome: jest.fn(),
}));
jest.mock('@cultuvilla/shared/services/organizationService', () => ({
  updateOrganization: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/cuotaService', () => ({
  saveCuotaSettings: jest.fn(),
  watchCuotaSettings: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('cuota'),
}));
jest.mock('@cultuvilla/shared/services/recordsService', () => ({
  watchLedgerEntriesForYear: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('ledger'),
}));
jest.mock('@cultuvilla/shared/services/groupMessageService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return { watchMyGroupMessages: mockWatcher('messages'), watchMyGroupMessageReads: mockWatcher('reads') };
});
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

describe('GroupSettings — what every socio sees', () => {
  it('offers the three switches, off by default, each with its hint, only where there are socios', () => {
    const r = render(<GroupSettings orgId="org1" uid="u1" sociosListVisible={false} />);
    for (const view of ['cuota', 'avisos', 'cuentas']) {
      expect(r.getByTestId(`group-settings-transparency-${view}`).props.accessibilityState).toMatchObject({ checked: false });
      expect(r.getByText(`groups.transparency.settings.${view}.hint`)).toBeTruthy();
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
