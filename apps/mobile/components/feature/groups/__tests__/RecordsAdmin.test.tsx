import { Alert, Share } from 'react-native';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { buildActaData, buildLedgerEntryData, buildSocioData, type SocioDataInput } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { createActa, deleteActa, recordLedgerEntry, reverseLedgerEntry, updateActa } from '@cultuvilla/shared/services/recordsService';
import { downloadFile } from '../../../../lib/export/downloadFile';
import { latestWatcher, resetWatchers, setWatched } from '../../../../test/watchers';
import { RecordsAdmin } from '../RecordsAdmin';
import { MyActas } from '../MyActas';

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
jest.mock('@cultuvilla/shared/services/recordsService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchActas: mockWatcher('actas'),
    watchSocioVisibleActas: mockWatcher('visibleActas'),
    watchLedgerEntriesForYear: mockWatcher('ledger'),
    createActa: jest.fn().mockResolvedValue('new'),
    updateActa: jest.fn().mockResolvedValue(undefined),
    deleteActa: jest.fn().mockResolvedValue(undefined),
    recordLedgerEntry: jest.fn().mockResolvedValue('new'),
    reverseLedgerEntry: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock('@cultuvilla/shared/services/cuotaService', () => ({
  watchCuotaPaymentsForYear: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('cuotaYear'),
}));
jest.mock('@cultuvilla/shared/services/socioService', () => ({
  watchOrgSocios: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('socios'),
}));

const YEAR = madridDayKey(new Date()).slice(0, 4);

function socio(id: string, input: Partial<SocioDataInput> & { bajaAt?: Date | null }) {
  const { bajaAt = null, ...rest } = input;
  return { id, ...buildSocioData({ kind: 'member', displayName: id, createdBy: 'x', altaAt: new Date('2020-01-01'), ...rest }), bajaAt };
}

const ACTA = {
  id: 'a1',
  ...buildActaData({
    body: 'asamblea_general',
    heldOn: `${YEAR}-03-15`,
    place: 'Local',
    attendees: [{ socioId: 'Ana', name: 'Ana' }],
    agenda: ['Cuentas'],
    agreements: ['Se aprueban las cuentas'],
    createdBy: 'u-admin',
  }),
};

const EXPENSE = {
  id: 'e1',
  ...buildLedgerEntryData({ kind: 'expense', amountCents: 12000, on: `${YEAR}-02-01`, concept: 'Orquesta', category: 'Fiestas', recordedBy: 'u-admin' }),
};

function pressConfirm() {
  const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
  buttons.at(-1)?.onPress?.();
}

const renderAdmin = () => render(<RecordsAdmin orgId="org1" orgName="La Anduela" uid="u-admin" />);

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('socios', [
    socio('Ana', { uid: 'u-ana', altaAt: new Date('2021-01-01') }),
    socio('Benito', { kind: 'typed', altaAt: new Date('2019-05-01'), bajaAt: new Date('2024-01-01') }),
    socio('Carla', { uid: 'u-carla', socioNumber: 57, altaAt: new Date('2022-01-01') }),
  ]);
  setWatched('actas', [ACTA]);
  setWatched('ledger', [EXPENSE]);
  setWatched('cuotaYear', [
    { id: 'c1', socioId: 'Ana', periodKey: YEAR, kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum', paidOn: `${YEAR}-01-10`, note: null, recordedBy: 'u-admin', recordedAt: new Date() },
  ]);
});

describe('Registros', () => {
  it('groups the libro, the actas and the year under one section', () => {
    const { getByTestId } = renderAdmin();
    const section = getByTestId('records-admin');
    expect(within(section).getByTestId('libro-socios')).toBeTruthy();
    expect(within(section).getByTestId('actas-admin')).toBeTruthy();
    expect(within(section).getByTestId('year-summary')).toBeTruthy();
    expect(within(getByTestId('year-totals')).getByText('groups.records.year.cuotas')).toBeTruthy();
  });

  it('exports the libro and the year as Excel', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('libro-export'));
    fireEvent.press(getByTestId('libro-export-xlsx'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'libro-socios-la-anduela.xlsx', 'application/xlsx-test'));
    fireEvent.press(getByTestId('year-export'));
    fireEvent.press(getByTestId('year-export-xlsx'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), `cuentas-${YEAR}-la-anduela.xlsx`, 'application/xlsx-test'));
  });
});

describe('Libro de socios', () => {
  it('counts altas and bajas, and lists every row by alta with its socio number once opened', () => {
    const { getByTestId, queryByTestId } = renderAdmin();
    expect(getByTestId('libro-socios')).toHaveTextContent(/groups\.records\.libro\.summary:2\|1/);
    expect(queryByTestId('libro-row-Benito')).toBeNull();
    fireEvent.press(getByTestId('libro-toggle'));
    expect(getByTestId('libro-row-Benito')).toHaveTextContent(/^Benito/);
    expect(getByTestId('libro-row-Benito')).toHaveTextContent(/groups\.records\.libro\.altaBaja/);
    expect(getByTestId('libro-row-Carla')).toHaveTextContent(/^groups\.records\.libro\.numbered:57\|Carla/);
  });

  it('exports the libro as CSV', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('libro-export'));
    fireEvent.press(getByTestId('libro-export-csv'));
    await waitFor(() =>
      expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining('Benito'), 'libro-socios-la-anduela.csv', 'text/csv;charset=utf-8'),
    );
  });
});

describe('Actas', () => {
  it('writes an acta with the socios present, the agenda and the acuerdos, one per line', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('acta-new'));
    fireEvent.press(getByTestId('acta-body-junta_directiva'));
    fireEvent.changeText(getByTestId('acta-place'), 'Bar de la plaza');
    fireEvent.press(getByTestId('acta-attendee-Ana'));
    fireEvent.changeText(getByTestId('acta-others'), '2');
    fireEvent.changeText(getByTestId('acta-agenda'), 'Fiestas\n\nCuentas');
    fireEvent.changeText(getByTestId('acta-agreements'), 'Contratar la orquesta');
    fireEvent.press(getByTestId('acta-save'));
    await waitFor(() =>
      expect(createActa).toHaveBeenCalledWith(
        'org1',
        expect.objectContaining({
          body: 'junta_directiva',
          place: 'Bar de la plaza',
          attendees: [{ socioId: 'Ana', name: 'Ana' }],
          otherAttendees: 2,
          agenda: ['Fiestas', 'Cuentas'],
          agreements: ['Contratar la orquesta'],
          visibleToSocios: false,
        }),
        'u-admin',
      ),
    );
  });

  it('ticks every active socio or none, and keeps the optional title and the chosen body', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('acta-new'));
    expect(getByTestId('acta-sheet')).toBeTruthy();
    expect(within(getByTestId('acta-body')).getByTestId('acta-body-asamblea_general')).toBeTruthy();
    fireEvent.changeText(getByTestId('acta-title'), 'Asamblea extraordinaria');
    fireEvent.press(getByTestId('acta-attendees-all'));
    fireEvent.press(getByTestId('acta-attendees-none'));
    fireEvent.press(getByTestId('acta-attendee-Carla'));
    expect(getByTestId('acta-scroll')).toBeTruthy();
    fireEvent.press(getByTestId('acta-save'));
    await waitFor(() =>
      expect(createActa).toHaveBeenCalledWith(
        'org1',
        expect.objectContaining({ body: 'asamblea_general', title: 'Asamblea extraordinaria', attendees: [{ socioId: 'Carla', name: 'Carla' }] }),
        'u-admin',
      ),
    );
  });

  it('offers only active socios to tick, and refuses a non-numeric count', () => {
    const { getByTestId, queryByTestId } = renderAdmin();
    fireEvent.press(getByTestId('acta-new'));
    expect(queryByTestId('acta-attendee-Benito')).toBeNull();
    fireEvent.changeText(getByTestId('acta-others'), 'dos');
    fireEvent.press(getByTestId('acta-save'));
    expect(createActa).not.toHaveBeenCalled();
  });

  it('opens an acta, shares its text, and shares it with the socios through an edit', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { getByTestId } = renderAdmin();
    expect(getByTestId('acta-row-a1')).toHaveTextContent(/groups\.records\.actas\.hidden/);
    fireEvent.press(getByTestId('acta-row-a1'));
    expect(within(getByTestId('acta-detail-scroll')).getByText('1. Se aprueban las cuentas')).toBeTruthy();
    fireEvent.press(getByTestId('acta-share'));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('ACTA — Asamblea general\nLa Anduela') });

    fireEvent.press(getByTestId('acta-edit'));
    fireEvent(getByTestId('acta-visible'), 'onValueChange', true);
    fireEvent.press(getByTestId('acta-save'));
    await waitFor(() =>
      expect(updateActa).toHaveBeenCalledWith('org1', 'a1', expect.objectContaining({ visibleToSocios: true, agenda: ['Cuentas'] }), 'u-admin'),
    );
  });

  it('deletes an acta after confirming', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('acta-row-a1'));
    fireEvent.press(getByTestId('acta-delete'));
    expect(deleteActa).not.toHaveBeenCalled();
    pressConfirm();
    await waitFor(() => expect(deleteActa).toHaveBeenCalledWith('org1', 'a1'));
  });
});

describe('Cuentas del año', () => {
  it('adds the cuota income to the other entries and shows the balance', () => {
    const { getByTestId } = renderAdmin();
    expect(latestWatcher('ledger').args).toEqual(['org1', YEAR]);
    expect(getByTestId('year-balance')).toHaveTextContent(/-90,00/);
    expect(getByTestId('ledger-entry-e1')).toHaveTextContent(/Orquesta/);
  });

  it('notes an expense, and reverses a wrong one after confirming', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('ledger-add'));
    fireEvent.changeText(getByTestId('ledger-amount'), '45,50');
    fireEvent.press(getByTestId('ledger-save'));
    expect(recordLedgerEntry).not.toHaveBeenCalled();
    fireEvent.changeText(getByTestId('ledger-concept'), 'Seguro');
    fireEvent.press(getByTestId('ledger-save'));
    await waitFor(() =>
      expect(recordLedgerEntry).toHaveBeenCalledWith('org1', expect.objectContaining({ kind: 'expense', amountCents: 4550, concept: 'Seguro' }), 'u-admin'),
    );

    fireEvent.press(getByTestId('ledger-reverse-e1'));
    pressConfirm();
    await waitFor(() => expect(reverseLedgerEntry).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'e1' }), 'u-admin'));
  });

  it('notes an income with its category', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('ledger-add'));
    expect(within(getByTestId('ledger-sheet')).getByTestId('ledger-scroll')).toBeTruthy();
    fireEvent.press(within(getByTestId('ledger-kind')).getByTestId('ledger-kind-income'));
    fireEvent.changeText(getByTestId('ledger-amount'), '300');
    fireEvent.changeText(getByTestId('ledger-concept'), 'Lotería de Navidad');
    fireEvent.changeText(getByTestId('ledger-category'), 'Lotería');
    fireEvent.press(getByTestId('ledger-save'));
    await waitFor(() =>
      expect(recordLedgerEntry).toHaveBeenCalledWith(
        'org1',
        expect.objectContaining({ kind: 'income', amountCents: 30000, concept: 'Lotería de Navidad', category: 'Lotería' }),
        'u-admin',
      ),
    );
  });

  it('never steps past the current year', () => {
    const { getByTestId } = renderAdmin();
    expect(getByTestId('year-label')).toHaveTextContent(YEAR);
    fireEvent.press(getByTestId('year-next'));
    expect(getByTestId('year-label')).toHaveTextContent(YEAR);
    fireEvent.press(getByTestId('year-prev'));
    fireEvent.press(getByTestId('year-next'));
    expect(getByTestId('year-label')).toHaveTextContent(YEAR);
  });

  it('steps back a year and exports the summary', async () => {
    const { getByTestId } = renderAdmin();
    fireEvent.press(getByTestId('year-prev'));
    expect(latestWatcher('ledger').args).toEqual(['org1', String(Number(YEAR) - 1)]);
    fireEvent.press(getByTestId('year-export'));
    fireEvent.press(getByTestId('year-export-csv'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^cuentas-\d{4}-la-anduela\.csv$/), 'text/csv;charset=utf-8'));
  });
});

describe('MyActas', () => {
  it('lists the shared actas for a socio, read-only, and hides itself when there are none', () => {
    setWatched('visibleActas', [{ ...ACTA, visibleToSocios: true }]);
    const { getByTestId, queryByTestId, unmount } = render(<MyActas orgId="org1" orgName="La Anduela" />);
    fireEvent.press(getByTestId('acta-row-a1'));
    expect(within(getByTestId('acta-detail')).getByText('1. Cuentas')).toBeTruthy();
    expect(getByTestId('acta-share')).toBeTruthy();
    expect(queryByTestId('acta-edit')).toBeNull();
    unmount();

    setWatched('visibleActas', []);
    expect(render(<MyActas orgId="org1" orgName="La Anduela" />).queryByTestId('my-actas')).toBeNull();
  });
});
