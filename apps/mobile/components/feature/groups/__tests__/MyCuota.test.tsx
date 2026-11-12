import { fireEvent, render } from '@testing-library/react-native';
import { Share } from 'react-native';
import { buildSocioData, type SocioDataInput } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { MyCuota } from '../MyCuota';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('@cultuvilla/shared/services/cuotaService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchCuotaSettings: mockWatcher('settings'),
    watchCuotaAssignmentsOf: mockWatcher('assignments'),
    watchSocioCuotaPayments: mockWatcher('payments'),
  };
});
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchMySocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('mine'),
}));

const YEAR = madridDayKey(new Date()).slice(0, 4);

function socio(id: string, input: Partial<SocioDataInput>) {
  return { id, ...buildSocioData({ kind: 'member', displayName: id, createdBy: 'x', altaAt: new Date('2020-01-01'), ...input }) };
}

const SETTINGS = {
  id: 'current', amountCents: 3000, yearAmounts: [], periodicity: 'yearly', dueMonth: 12, dueDay: 31, graceDays: 0, startPeriod: '2020',
  tiers: [{ id: 'fam', name: 'Familiar', amountCents: 5000, yearAmounts: [], coversPersonas: true }],
  bizum: '600111222', iban: 'ES12 3456', payInstructions: 'En mano al tesorero', remindersEnabled: true,
  configuredBy: 'admin', updatedAt: new Date(),
};

const payment = (id: string, socioId: string, over: Record<string, unknown> = {}) => ({
  id, socioId, periodKey: YEAR, kind: 'payment', reversesId: null, amountCents: 5000, method: 'bizum',
  paidOn: `${YEAR}-01-15`, note: null, recordedBy: 'admin', recordedAt: new Date(), ...over,
});

beforeEach(() => {
  resetWatchers();
  setWatched('mine', [socio('Ana', { uid: 'u1' }), socio('Nene', { kind: 'persona', personId: 'p1', responsibleUid: 'u1' })]);
  setWatched('assignments', [{ id: 'Ana', tierId: 'fam', exempt: false, customAmountCents: null, updatedBy: 'admin', updatedAt: new Date() }]);
});

describe('MyCuota', () => {
  it('shows nothing until the group has a cuota', () => {
    setWatched('settings', null);
    setWatched('payments', []);
    const { queryByTestId } = render(<MyCuota orgId="org1" uid="u1" />);
    expect(queryByTestId('my-cuota')).toBeNull();
  });

  it('stamps the household PAGADA once one family payment covers it, with no way to pay', () => {
    setWatched('settings', SETTINGS);
    setWatched('payments', [payment('p1', 'Ana')]);
    const { getByTestId, queryByTestId } = render(<MyCuota orgId="org1" uid="u1" />);
    expect(getByTestId('my-cuota-stamp-al_dia')).toHaveTextContent('groups.myCuota.stamp.al_dia');
    expect(getByTestId('my-cuota-amount')).toHaveTextContent(/50,00/);
    expect(getByTestId('my-cuota-row-Ana')).toHaveTextContent(/groups\.cuota\.status\.al_dia/);
    expect(getByTestId('my-cuota-row-Nene')).toHaveTextContent(/groups\.myCuota\.inYours/);
    expect(queryByTestId('my-cuota-due')).toBeNull();
    expect(queryByTestId('my-cuota-how-to-pay')).toBeNull();
    expect(getByTestId('my-cuota-entry-p1')).toHaveTextContent(/groups\.cuota\.methods\.bizum/);
  });

  it('owes the cuota while unpaid: the amount, the days left and how to pay with copy buttons', () => {
    setWatched('settings', SETTINGS);
    setWatched('payments', []);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const { getByTestId, getByText, queryByTestId } = render(<MyCuota orgId="org1" uid="u1" />);
    expect(getByTestId('my-cuota-stamp-pendiente')).toHaveTextContent('groups.myCuota.stamp.pendiente');
    expect(getByTestId('my-cuota-amount')).toHaveTextContent(/50,00/);
    expect(getByTestId('my-cuota-due')).toHaveTextContent(/groups\.cuota\.dueOn/);
    expect(getByTestId('my-cuota-bizum')).toHaveTextContent(/600111222/);
    expect(getByTestId('my-cuota-iban')).toHaveTextContent(/ES12 3456/);
    expect(getByTestId('my-cuota-concept')).toHaveTextContent(new RegExp(`Cuota ${YEAR} — Ana`));
    expect(getByText('En mano al tesorero')).toBeTruthy();
    expect(queryByTestId('my-cuota-paid')).toBeNull();

    fireEvent.press(getByTestId('my-cuota-iban-copy'));
    expect(share).toHaveBeenCalledWith({ message: 'ES12 3456' });
    share.mockRestore();
  });

  it('strikes out a reversed payment, hides the reversal itself and owes the cuota again', () => {
    setWatched('settings', SETTINGS);
    setWatched('payments', [
      payment('rev_p1', 'Ana', { kind: 'reversal', reversesId: 'p1' }),
      payment('p1', 'Ana'),
    ]);
    const { getByTestId, queryByTestId } = render(<MyCuota orgId="org1" uid="u1" />);
    expect(getByTestId('my-cuota-stamp-pendiente')).toBeTruthy();
    expect(getByTestId('my-cuota-entry-p1')).toHaveTextContent(/groups\.cuota\.reversed/);
    expect(queryByTestId('my-cuota-entry-rev_p1')).toBeNull();
  });

  it('leaves the persona lines out when the member pays only for themselves', () => {
    setWatched('mine', [socio('Ana', { uid: 'u1' })]);
    setWatched('assignments', []);
    setWatched('settings', SETTINGS);
    setWatched('payments', []);
    const { getByTestId, queryByTestId } = render(<MyCuota orgId="org1" uid="u1" />);
    expect(getByTestId('my-cuota-amount')).toHaveTextContent(/30,00/);
    expect(queryByTestId('my-cuota-row-Ana')).toBeNull();
  });
});
