import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildSocioData, type SocioDataInput } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import {
  recordCuotaPayment,
  reverseCuotaPayment,
  saveCuotaSettings,
  setCuotaAssignment,
} from '@cultuvilla/shared/services/cuotaService';
import { downloadFile } from '../../../../lib/export/downloadFile';
import { emitWatched, latestWatcher, resetWatchers, setWatched } from '../../../../test/watchers';
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
// Due 1 January: vencida from the 2nd, pendiente on the day itself.
const UNPAID = TODAY > `${YEAR}-01-01` ? 'vencida' : 'pendiente';

function socio(id: string, input: Partial<SocioDataInput>) {
  return { id, ...buildSocioData({ kind: 'member', displayName: id, createdBy: 'x', altaAt: new Date('2020-01-01'), ...input }) };
}

const SETTINGS = {
  id: 'current', amountCents: 3000, yearAmounts: [], periodicity: 'yearly', dueMonth: 1, dueDay: 1, graceDays: 0, startPeriod: YEAR,
  tiers: [{ id: 'jub', name: 'Jubilados', amountCents: 1500, yearAmounts: [], coversPersonas: false }],
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

function openSettings(getByTestId: ReturnType<typeof renderAdmin>['getByTestId']) {
  fireEvent.press(getByTestId('cuota-more'));
  fireEvent.press(getByTestId('cuota-menu-settings'));
}

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
      amountCents: 2550, periodicity: 'yearly', dueMonth: 3, dueDay: 1, graceDays: 0, startPeriod: YEAR,
      bizum: '600111222', remindersEnabled: false,
      tiers: [expect.objectContaining({ name: 'Familiar', amountCents: 4000, yearAmounts: [], coversPersonas: true })],
    });
  });

  it('prices the base cuota and a tier by year, and shows the viewed year its own', async () => {
    setWatched('settings', { ...SETTINGS, yearAmounts: [{ year: YEAR, amountCents: 3500 }] });
    const { getAllByText, getByTestId, getByText, queryByTestId } = renderAdmin();
    expect(getAllByText(/35,00/).length).toBeGreaterThan(0);
    openSettings(getByTestId);
    expect(getByTestId('cuota-settings-years')).toBeTruthy();
    expect(getByTestId('cuota-tier-years-jub')).toBeTruthy();
    expect(getByTestId('cuota-settings-years-year-0').props.value).toBe(YEAR);

    fireEvent.press(getByTestId('cuota-settings-years-add'));
    fireEvent.changeText(getByTestId('cuota-settings-years-year-1'), YEAR);
    fireEvent.changeText(getByTestId('cuota-settings-years-amount-1'), '40');
    fireEvent.press(getByTestId('cuota-settings-save'));
    expect(getByText('groups.cuota.settings.yearsInvalid')).toBeTruthy();
    expect(saveCuotaSettings).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('cuota-settings-years-remove-1'));

    fireEvent.press(getByTestId('cuota-tier-years-jub-toggle'));
    fireEvent.changeText(getByTestId('cuota-tier-years-jub-amount-0'), '18');
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(saveCuotaSettings).toHaveBeenCalled());
    expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({
      yearAmounts: [{ year: YEAR, amountCents: 3500 }],
      tiers: [expect.objectContaining({ id: 'jub', yearAmounts: [{ year: YEAR, amountCents: 1800 }] })],
    });
    expect(queryByTestId('cuota-settings-years-remove-1')).toBeNull();
  });

  it('switching the price by year off forgets the years', async () => {
    setWatched('settings', { ...SETTINGS, yearAmounts: [{ year: YEAR, amountCents: 3500 }] });
    const { getByTestId } = renderAdmin();
    openSettings(getByTestId);
    fireEvent.press(getByTestId('cuota-settings-years-toggle'));
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(saveCuotaSettings).toHaveBeenCalled());
    expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({ yearAmounts: [] });
  });

  it('keeps the settings form mounted while its own first save switches the screen to the configured list', async () => {
    setWatched('settings', null);
    let ack: () => void = () => undefined;
    jest.mocked(saveCuotaSettings).mockImplementationOnce(() => new Promise<void>((resolve) => { ack = resolve; }));
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-configure'));
    fireEvent.changeText(getByTestId('cuota-settings-amount'), '45');
    fireEvent.press(getByTestId('cuota-settings-save'));
    // The device's write reaches the listener before the server acknowledges it.
    emitWatched('settings', SETTINGS);
    // A remounted form would have reset from the stored 30,00.
    expect(getByTestId('cuota-settings-amount').props.value).toBe('45');
    await act(async () => ack());
    expect(queryByTestId('cuota-settings-sheet')).toBeNull();
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

  it('shows collected vs total, opens on who still owes, and filters by chip and search', () => {
    setWatched('settings', SETTINGS);
    const { getByTestId, queryByTestId } = renderAdmin();
    expect(getByTestId('cuota-period')).toHaveTextContent(new RegExp(YEAR));
    // Ana paid 30 of the 90 the three socios owe.
    expect(getByTestId('cuota-collected')).toHaveTextContent(/30,00/);
    expect(getByTestId('cuota-summary')).toHaveTextContent(/90,00/);
    expect(getByTestId('cuota-paid-count')).toHaveTextContent('1');
    expect(getByTestId('cuota-progress')).toBeTruthy();
    expect(getByTestId('cuota-filter')).toBeTruthy();
    expect(queryByTestId('cuota-row-Ana')).toBeNull();
    expect(getByTestId('cuota-row-Paco')).toBeTruthy();
    expect(getByTestId('cuota-record-Paco')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-filter-paid'));
    expect(getByTestId('cuota-row-Ana')).toHaveTextContent(/groups\.cuota\.status\.al_dia/);
    expect(queryByTestId('cuota-row-Paco')).toBeNull();
    fireEvent.press(getByTestId('cuota-filter-exempt'));
    expect(getByTestId('cuota-empty')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-filter-pending'));
    fireEvent.changeText(getByTestId('cuota-search'), 'teso');
    expect(queryByTestId('cuota-row-Paco')).toBeNull();
    expect(getByTestId('cuota-row-Tesorera')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-filter-vencida'));
    expect(queryByTestId('cuota-row-Tesorera') !== null).toBe(UNPAID === 'vencida');
  });

  it('opens a socio\'s record with the reminder sent', () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-row-Paco'));
    expect(getByTestId('cuota-socio-sheet')).toBeTruthy();
    expect(getByTestId('cuota-socio-scroll')).toBeTruthy();
    expect(getByTestId('cuota-socio-reminder')).toHaveTextContent(/groups\.cuota\.admin\.reminderSent/);
  });

  it('"✓ Pagó" asks only how they paid and records what is owed, dated today', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-record-Paco'));
    expect(getByTestId('cuota-payment-quick-amount')).toHaveTextContent(/30,00/);
    fireEvent.press(getByTestId('cuota-payment-quick-bizum'));
    await waitFor(() =>
      expect(recordCuotaPayment).toHaveBeenCalledWith(
        'org1',
        { socioId: 'Paco', periodKey: YEAR, amountCents: 3000, method: 'bizum', paidOn: TODAY, note: '' },
        'u-admin',
      ),
    );
  });

  it('switches reminders from the menu', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-more'));
    expect(getByTestId('cuota-menu')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-menu-reminders'));
    await waitFor(() => expect(saveCuotaSettings).toHaveBeenCalled());
    expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({ remindersEnabled: false, amountCents: 3000 });
  });

  it('records a payment for the period, prefilled with what is owed', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-record-Paco'));
    fireEvent.press(getByTestId('cuota-payment-other'));
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
    fireEvent.press(getByTestId('cuota-filter-paid'));
    fireEvent.press(getByTestId('cuota-row-Ana'));
    fireEvent.press(getByTestId('cuota-reverse-p1'));
    pressConfirm();
    expect(reverseCuotaPayment).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'p1' }), null, 'u-admin');
  });

  it('puts a socio on a tier or exempts them', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-row-Paco'));
    fireEvent.press(getByTestId('cuota-socio-assign'));
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
    expect(getByTestId('cuota-period')).toHaveTextContent(new RegExp(String(Number(YEAR) - 1)));
    expect(latestWatcher('payments').args).toEqual(['org1', String(Number(YEAR) - 1)]);
  });

  it('edits the settings; a new period restarts tracking now', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    expect(getByTestId('cuota-admin')).toBeTruthy();
    openSettings(getByTestId);
    expect(getByTestId('cuota-settings-sheet')).toBeTruthy();
    expect(getByTestId('cuota-settings-scroll')).toBeTruthy();
    expect(getByTestId('cuota-settings-amount').props.value).toBe('30');
    expect(getByTestId('cuota-tier-name-jub').props.value).toBe('Jubilados');
    fireEvent.changeText(getByTestId('cuota-tier-amount-jub'), '12');
    fireEvent.press(getByTestId('cuota-tier-covers-jub'));
    expect(getByTestId('cuota-settings-periodicity')).toBeTruthy();
    fireEvent.press(getByTestId('cuota-settings-periodicity-monthly'));
    fireEvent.changeText(getByTestId('cuota-settings-iban'), 'es12 3456');
    fireEvent.changeText(getByTestId('cuota-settings-instructions'), 'En mano');
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(saveCuotaSettings).toHaveBeenCalled());
    expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({
      periodicity: 'monthly', startPeriod: TODAY.slice(0, 7), graceDays: 0, iban: 'es12 3456', payInstructions: 'En mano',
      remindersEnabled: true, tiers: [{ id: 'jub', name: 'Jubilados', amountCents: 1200, yearAmounts: [], coversPersonas: true }],
    });
  });

  it('removes a tier', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId, queryByTestId } = renderAdmin();
    openSettings(getByTestId);
    fireEvent.press(getByTestId('cuota-tier-remove-jub'));
    expect(queryByTestId('cuota-tier-jub')).toBeNull();
    fireEvent.press(getByTestId('cuota-settings-save'));
    await waitFor(() => expect(jest.mocked(saveCuotaSettings).mock.calls[0]![1]).toMatchObject({ tiers: [] }));
  });

  it('records a payment by another method', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-row-Paco'));
    fireEvent.press(getByTestId('cuota-socio-record'));
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
    fireEvent.press(getByTestId('cuota-filter-paid'));
    fireEvent.press(getByTestId('cuota-row-Ana'));
    fireEvent.press(getByTestId('cuota-socio-assign'));
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
    fireEvent.press(getByTestId('cuota-filter-paid'));
    fireEvent.press(getByTestId('cuota-row-Ana'));
    expect(getByTestId('cuota-entry-p1')).toHaveTextContent(/groups\.cuota\.methods\.bizum/);
    fireEvent.press(getByTestId('cuota-period-next'));
    expect(getByTestId('cuota-period')).toHaveTextContent(new RegExp(String(Number(YEAR) + 1)));
  });

  it('exports the period as Excel or CSV', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-more'));
    fireEvent.press(getByTestId('cuota-menu-export-csv'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining('Ana'), expect.stringMatching(/^cuotas-.*\.csv$/), 'text/csv;charset=utf-8'));
    fireEvent.press(getByTestId('cuota-more'));
    fireEvent.press(getByTestId('cuota-menu-export-xlsx'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), expect.stringMatching(/\.xlsx$/), 'application/xlsx-test'));
  });

  it('cobra en la mesa: search, tap the method, and the cash box adds up', async () => {
    setWatched('settings', SETTINGS);
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('cuota-desk-open'));
    expect(getByTestId('cuota-desk')).toBeTruthy();
    expect(getByTestId('cuota-desk-scroll')).toBeTruthy();
    fireEvent.changeText(getByTestId('cuota-desk-search'), 'zzz');
    expect(getByTestId('cuota-desk-none')).toBeTruthy();
    fireEvent.changeText(getByTestId('cuota-desk-search'), 'pac');
    fireEvent.press(getByTestId('cuota-desk-result-Paco'));
    expect(getByTestId('cuota-desk-card')).toHaveTextContent(/30,00/);
    fireEvent.press(getByTestId('cuota-desk-method-efectivo'));
    await waitFor(() =>
      expect(recordCuotaPayment).toHaveBeenCalledWith(
        'org1',
        { socioId: 'Paco', periodKey: YEAR, amountCents: 3000, method: 'efectivo', paidOn: TODAY, note: '' },
        'u-admin',
      ),
    );
    await waitFor(() => expect(getByTestId('cuota-desk-tally')).toHaveTextContent(/1\|30,00/));
    expect(getByTestId('cuota-desk-last')).toBeTruthy();
    expect(queryByTestId('cuota-desk-card')).toBeNull();

    fireEvent.changeText(getByTestId('cuota-desk-search'), 'teso');
    fireEvent.press(getByTestId('cuota-desk-result-Tesorera'));
    fireEvent.press(getByTestId('cuota-desk-other'));
    fireEvent.changeText(getByTestId('cuota-desk-amount'), '10');
    fireEvent.press(getByTestId('cuota-desk-method-bizum'));
    await waitFor(() => expect(jest.mocked(recordCuotaPayment).mock.calls[1]![1]).toMatchObject({ socioId: 'Tesorera', amountCents: 1000, method: 'bizum' }));
    // Bizum is not cash: the box still holds 30.
    await waitFor(() => expect(getByTestId('cuota-desk-tally')).toHaveTextContent(/2\|30,00/));
    fireEvent.changeText(getByTestId('cuota-desk-search'), 'ana');
    fireEvent.press(getByTestId('cuota-desk-result-Ana'));
    fireEvent.press(getByTestId('cuota-desk-method-transferencia'));
    expect(recordCuotaPayment).toHaveBeenCalledTimes(2);
  });
});
