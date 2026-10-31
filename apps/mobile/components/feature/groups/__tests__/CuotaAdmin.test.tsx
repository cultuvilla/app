import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildSocioData, type SocioDataInput } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import {
  recordCuotaPayment,
  reverseCuotaPayment,
  saveCuotaSettings,
  setCuotaAssignment,
} from '@cultuvilla/shared/services/cuotaService';
import { downloadFile } from '../../../../lib/export/downloadFile';
import { latestWatcher, resetWatchers, setWatched } from '../../../../test/watchers';
import { CuotaAdmin } from '../CuotaAdmin';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('../../../../lib/export/downloadFile', () => ({ downloadFile: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../../lib/export/rosterWorkbook', () => ({
  __esModule: true,
  XLSX_MIME: 'application/xlsx-test',
  buildRosterWorkbook: jest.fn().mockResolvedValue(new ArrayBuffer(1)),
}));
jest.mock('@cultuvilla/shared/services/cuotaService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchCuotaSettings: mockWatcher('settings'),
    watchCuotaAssignments: mockWatcher('assignments'),
    watchCuotaPeriodPayments: mockWatcher('payments'),
    watchCuotaPeriodReminders: mockWatcher('reminders'),
    saveCuotaSettings: jest.fn().mockResolvedValue(undefined),
    setCuotaAssignment: jest.fn().mockResolvedValue(undefined),
    recordCuotaPayment: jest.fn().mockResolvedValue('new'),
    reverseCuotaPayment: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchOrgSocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('socios'),
}));

const TODAY = madridDayKey(new Date());
const YEAR = TODAY.slice(0, 4);
// Due 1 January with no grace: vencida from the 2nd, pendiente on the day itself.
const UNPAID = TODAY > `${YEAR}-01-01` ? 'vencida' : 'pendiente';

function socio(id: string, input: Partial<SocioDataInput>) {
  return { id, ...buildSocioData({ kind: 'member', displayName: id, createdBy: 'x', altaAt: new Date('2020-01-01'), ...input }) };
}

const SETTINGS = {
  id: 'current', amountCents: 3000, periodicity: 'yearly', dueMonth: 1, dueDay: 1, graceDays: 0, startPeriod: YEAR,
  tiers: [{ id: 'jub', name: 'Jubilados', amountCents: 1500, coversPersonas: false }],
  bizum: null, iban: null, payInstructions: null, remindersEnabled: true, configuredBy: 'u-admin', updatedAt: new Date(),
};

const PAID = {
  id: 'p1', socioId: 'Ana', periodKey: YEAR, kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum',
  paidOn: `${YEAR}-01-01`, note: null, recordedBy: 'u-admin', recordedAt: new Date(),
};

function pressConfirm() {
  const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
  buttons.at(-1)?.onPress?.();
}

const renderAdmin = () => render(<CuotaAdmin orgId="org1" orgName="La Anduela" uid="u-admin" adminUids={['u-admin']} />);

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('socios', [
    socio('Ana', { uid: 'u-ana' }),
    socio('Tesorera', { uid: 'u-admin', adminTitle: 'tesorero' }),
    socio('Paco', { kind: 'typed' }),
  ]);
  setWatched('assignments', []);
  setWatched('payments', [PAID]);
  setWatched('reminders', [{ id: `${YEAR}_after_Paco`, socioId: 'Paco', periodKey: YEAR, stage: 'after', recipientUid: null, push: false, email: true, signerName: 'Tesorera', sentAt: new Date() }]);
});

describe('CuotaAdmin', () => {
  it('offers to configure a cuota, starting at this period with reminders off', async () => {
    setWatched('settings', null);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-configure'));
    fireEvent.changeText(getByTestId('cuota-settings-amount'), '25,50');
    fireEvent.changeText(getByTestId('cuota-settings-bizum'), '600111222');
    fireEvent.press(getByTestId('cuota-settings-month-trigger'));
    fireEvent.press(getByTestId('cuota-settings-month-options-3'));
    fireEvent.press(getByTestId('cuota-tier-add'));
    fireEvent.press(getByTestId('cuota-settings-save'));
    // The new tier has no name yet: nothing is saved.
    expect(saveCuotaSettings).not.toHaveBeenCalled();
    const tierName = getByTestId(/^cuota-tier-name-/);
    fireEvent.changeText(tierName, 'Familiar');
    fireEvent.changeText(getByTestId(/^cuota-tier-amount-/), '40');
    fireEvent.press(getByTestId(/^cuota-tier-covers-/));
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(saveCuotaSettings).toHaveBeenCalled());
    const [orgId, values, uid] = jest.mocked(saveCuotaSettings).mock.calls[0]!;
    expect(orgId).toBe('org1');
    expect(uid).toBe('u-admin');
    expect(values).toMatchObject({
      amountCents: 2550, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 30, startPeriod: YEAR,
      bizum: '600111222', remindersEnabled: false,
      tiers: [expect.objectContaining({ name: 'Familiar', amountCents: 4000, coversPersonas: true })],
    });
  });

  it('refuses an amount that is not money', () => {
    setWatched('settings', null);
    const { getByTestId, getByText } = renderAdmin();
    fireEvent.press(getByTestId('cuota-configure'));
    fireEvent.changeText(getByTestId('cuota-settings-amount'), 'treinta');
    fireEvent.press(getByTestId('cuota-settings-save'));
    expect(getByText('groups.cuota.settings.amountInvalid')).toBeTruthy();
    expect(saveCuotaSettings).not.toHaveBeenCalled();
  });

  it('lists the period with statuses, filters, and the reminders sent', () => {
    setWatched('settings', SETTINGS);
    const { getByTestId, queryByTestId } = renderAdmin();
    expect(getByTestId('cuota-period')).toHaveTextContent(YEAR);
    expect(getByTestId('cuota-row-Ana')).toHaveTextContent(/groups\.cuota\.status\.al_dia/);
    expect(getByTestId('cuota-row-Paco')).toHaveTextContent(new RegExp(`groups\\.cuota\\.status\\.${UNPAID}`));
    expect(getByTestId('cuota-row-Paco')).toHaveTextContent(/groups\.cuota\.admin\.reminderSent/);
    fireEvent.press(getByTestId(`cuota-filter-${UNPAID}`));
    expect(queryByTestId('cuota-row-Ana')).toBeNull();
    expect(getByTestId('cuota-row-Paco')).toBeTruthy();
    expect(getByTestId('cuota-export')).toBeTruthy();
  });

  it('records a payment for the period, prefilled with what is owed', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-record-Paco'));
    expect(getByTestId('cuota-payment-amount').props.value).toBe('30');
    fireEvent.press(getByTestId('cuota-payment-method-trigger'));
    fireEvent.press(getByTestId('cuota-payment-method-options-transferencia'));
    fireEvent.changeText(getByTestId('cuota-payment-note'), 'en la cena');
    fireEvent.press(getByTestId('cuota-payment-save'));
    await waitFor(() =>
      expect(recordCuotaPayment).toHaveBeenCalledWith(
        'org1',
        { socioId: 'Paco', periodKey: YEAR, amountCents: 3000, method: 'transferencia', paidOn: TODAY, note: 'en la cena' },
        'u-admin',
      ),
    );
  });

  it('reverses a payment after confirming, never edits it', () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-history-Ana'));
    fireEvent.press(getByTestId('cuota-reverse-p1'));
    pressConfirm();
    expect(reverseCuotaPayment).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'p1' }), null, 'u-admin');
  });

  it('puts a socio on a tier or exempts them', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-assign-Paco'));
    fireEvent.press(getByTestId('cuota-assignment-choice-jub'));
    fireEvent.press(getByTestId('cuota-assignment-save'));
    await waitFor(() =>
      expect(setCuotaAssignment).toHaveBeenCalledWith('org1', 'Paco', { tierId: 'jub', exempt: false, customAmountCents: null }, 'u-admin'),
    );
  });

  it('walks back to an earlier period only as far as the cuota started', () => {
    setWatched('settings', { ...SETTINGS, startPeriod: String(Number(YEAR) - 1) });
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-period-prev'));
    expect(getByTestId('cuota-period')).toHaveTextContent(String(Number(YEAR) - 1));
    expect(latestWatcher('payments').args).toEqual(['org1', String(Number(YEAR) - 1)]);
  });

  it('edits the settings; a new period restarts tracking now', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    expect(getByTestId('cuota-admin')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-edit-settings'));
    expect(getByTestId('cuota-settings-sheet')).toBeTruthy();
    expect(getByTestId('cuota-settings-scroll')).toBeTruthy();
    expect(getByTestId('cuota-settings-amount').props.value).toBe('30');
    expect(getByTestId('cuota-tier-name-jub').props.value).toBe('Jubilados');
    fireEvent.changeText(getByTestId('cuota-tier-amount-jub'), '12');
    fireEvent.press(getByTestId('cuota-tier-covers-jub'));
    expect(getByTestId('cuota-settings-periodicity')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-settings-periodicity-monthly'));
    expect(getByTestId('cuota-settings-grace')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-settings-grace-trigger'));
    fireEvent.press(getByTestId('cuota-settings-grace-options-15'));
    fireEvent.changeText(getByTestId('cuota-settings-iban'), 'es12 3456');
    fireEvent.changeText(getByTestId('cuota-settings-instructions'), 'En mano');
    fireEvent.press(getByTestId('cuota-settings-reminders'));
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(saveCuotaSettings).toHaveBeenCalled());
    expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({
      periodicity: 'monthly', startPeriod: TODAY.slice(0, 7), graceDays: 15, iban: 'es12 3456', payInstructions: 'En mano',
      remindersEnabled: false, tiers: [{ id: 'jub', name: 'Jubilados', amountCents: 1200, coversPersonas: true }],
    });
  });

  it('removes a tier', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-edit-settings'));
    fireEvent.press(getByTestId('cuota-tier-remove-jub'));
    expect(queryByTestId('cuota-tier-jub')).toBeNull();
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({ tiers: [] }));
  });

  it('records a payment by another method', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-record-Paco'));
    expect(getByTestId('cuota-payment-sheet')).toBeTruthy();
    expect(getByTestId('cuota-payment-scroll')).toBeTruthy();
    expect(getByTestId('cuota-payment-method')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-payment-method-trigger'));
    fireEvent.press(getByTestId('cuota-payment-method-options-domiciliacion'));
    fireEvent.press(getByTestId('cuota-payment-save'));
    await waitFor(() => expect(jest.mocked(recordCuotaPayment).mock.calls[0]![1]).toMatchObject({ method: 'domiciliacion' }));
  });

  it('gives a socio a custom amount', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-assign-Ana'));
    expect(getByTestId('cuota-assignment-sheet')).toBeTruthy();
    expect(getByTestId('cuota-assignment-scroll')).toBeTruthy();
    expect(getByTestId('cuota-assignment-choice')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-assignment-choice-custom'));
    fireEvent.changeText(getByTestId('cuota-assignment-amount'), '10');
    fireEvent.press(getByTestId('cuota-assignment-save'));
    await waitFor(() =>
      expect(setCuotaAssignment).toHaveBeenCalledWith('org1', 'Ana', { tierId: null, exempt: false, customAmountCents: 1000 }, 'u-admin'),
    );
  });

  it('shows the history entries and moves forward a period', () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    expect(getByTestId('cuota-filter')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-history-Ana'));
    expect(getByTestId('cuota-entry-p1')).toHaveTextContent(/groups\.cuota\.methods\.bizum/);
    fireEvent.press(getByTestId('cuota-period-next'));
    expect(getByTestId('cuota-period')).toHaveTextContent(String(Number(YEAR) + 1));
  });

  it('exports the period as Excel or CSV', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-export'));
    fireEvent.press(getByTestId('cuota-export-csv'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining('Ana'), expect.stringMatching(/^cuotas-.*\.csv$/), 'text/csv;charset=utf-8'));
    fireEvent.press(getByTestId('cuota-export'));
    fireEvent.press(getByTestId('cuota-export-xlsx'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.stringMatching(/\.xlsx$/), 'application/xlsx-test'));
  });
});
