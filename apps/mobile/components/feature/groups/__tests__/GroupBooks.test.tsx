import { Alert, Share } from 'react-native';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { buildActaData, buildGroupTaskData, buildLedgerCategoryData, buildLedgerEntryData, buildSocioData, type SocioDataInput } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { createActa, deleteActa, recordLedgerEntry, reverseLedgerEntry, updateActa } from '@cultuvilla/shared/services/recordsService';
import { createLedgerCategory, deleteLedgerCategory, renameLedgerCategory } from '@cultuvilla/shared/services/ledgerCategoryService';
import { router } from 'expo-router';
import { downloadFile } from '../../../../lib/export/downloadFile';
import { buildWorkbook } from '../../../../lib/export/rosterWorkbook';
import { latestWatcher, resetWatchers, setWatched } from '../../../../test/watchers';
import { AsambleaChecklist } from '../AsambleaChecklist';
import { LibroDoor } from '../LibroDoor';
import { ActasAdmin } from '../ActasAdmin';
import { LibroSocios } from '../LibroSocios';
import { YearSummaryAdmin } from '../YearSummaryAdmin';

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
  buildWorkbook: jest.fn().mockResolvedValue(new ArrayBuffer(2)),
}));
jest.mock('@cultuvilla/shared/services/recordsService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchActas: mockWatcher('actas'),
    watchSocioVisibleActas: mockWatcher('visibleActas'),
    watchLedgerEntriesForYear: mockWatcher('ledger'),
    watchAllLedgerEntries: mockWatcher('allLedger'),
    createActa: jest.fn().mockResolvedValue('new'),
    updateActa: jest.fn().mockResolvedValue(undefined),
    deleteActa: jest.fn().mockResolvedValue(undefined),
    recordLedgerEntry: jest.fn().mockResolvedValue('new'),
    reverseLedgerEntry: jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock('@cultuvilla/shared/services/ledgerCategoryService', () => ({
  watchLedgerCategories: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('ledgerCategories'),
  createLedgerCategory: jest.fn().mockResolvedValue('new'),
  renameLedgerCategory: jest.fn().mockResolvedValue(undefined),
  deleteLedgerCategory: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@cultuvilla/shared/services/cuotaService', () => ({
  watchCuotaPaymentsForYear: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('cuotaYear'),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  watchOpenGroupTasks: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('tasks'),
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

const ORQUESTA = { id: 'expense_orquesta', ...buildLedgerCategoryData({ name: 'Orquesta', kind: 'expense', createdBy: 'u-admin' }) };
const LOTERIA = { id: 'income_loter%C3%ADa', ...buildLedgerCategoryData({ name: 'Lotería', kind: 'income', createdBy: 'u-admin' }) };

function pressConfirm() {
  const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
  buttons.at(-1)?.onPress?.();
}

const renderFolder = () => render(<AsambleaChecklist orgId="org1" orgName="La Anduela" />);
const renderLibro = () => render(<LibroSocios orgId="org1" orgName="La Anduela" />);
const renderActas = () => render(<ActasAdmin orgId="org1" orgName="La Anduela" uid="u-admin" />);
const renderYear = () => render(<YearSummaryAdmin orgId="org1" orgName="La Anduela" uid="u-admin" />);

function dayFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return madridDayKey(d);
}

function asambleaTask(dueOn: string) {
  return {
    id: 't1',
    ...buildGroupTaskData({
      title: 'Asamblea general anual',
      dueOn,
      recurrence: { kind: 'calendar', unit: 'year', interval: 1, anchorOn: dueOn },
      createdBy: 'u-admin',
    }),
  };
}

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
  setWatched('tasks', []);
  setWatched('ledger', [EXPENSE]);
  setWatched('allLedger', [EXPENSE]);
  setWatched('ledgerCategories', [ORQUESTA, LOTERIA]);
  setWatched('cuotaYear', [
    { id: 'c1', socioId: 'Ana', periodKey: YEAR, kind: 'payment', reversesId: null, amountCents: 3000, method: 'bizum', paidOn: `${YEAR}-01-10`, note: null, recordedBy: 'u-admin', recordedAt: new Date() },
  ]);
});

describe('the books', () => {
  it("opens the libro from an admin's Socios, with its altas and bajas", () => {
    const { getByTestId } = render(<LibroDoor orgId="org1" />);
    expect(getByTestId('records-door-libro')).toHaveTextContent(/groups\.records\.libro\.summary:2\|1/);
    fireEvent.press(getByTestId('records-door-libro'));
    expect(router.push).toHaveBeenCalledWith('/grupos/org1/registros/libro');
  });

  it('shows no checklist with no asamblea near', () => {
    expect(renderFolder().queryByTestId('asamblea-checklist')).toBeNull();
  });

  it('lists what the asamblea still needs, each line opening its door', () => {
    setWatched('tasks', [asambleaTask(dayFromToday(10))]);
    setWatched('socios', [socio('Ana', { socioNumber: 1 }), socio('Pepe', {})]);
    const { getByTestId } = renderFolder();
    expect(getByTestId('asamblea-check-libro')).toHaveTextContent(/groups\.records\.asamblea\.libroUnnumbered:1/);
    expect(getByTestId('asamblea-check-acta')).toHaveTextContent(/groups\.records\.asamblea\.acta(Hidden|Missing)/);
    expect(getByTestId('asamblea-check-cuentas')).toHaveTextContent(/groups\.records\.asamblea\.cuentasOk/);
    fireEvent.press(getByTestId('asamblea-check-libro'));
    expect(router.push).toHaveBeenCalledWith('/grupos/org1/registros/libro');
  });

  it('hides the checklist while the asamblea is still far', () => {
    setWatched('tasks', [asambleaTask(dayFromToday(90))]);
    expect(renderFolder().queryByTestId('asamblea-checklist')).toBeNull();
  });

  it('exports the libro, the actas and the accounts in one workbook', async () => {
    setWatched('tasks', [asambleaTask(dayFromToday(5))]);
    const { getByTestId } = renderFolder();
    fireEvent.press(getByTestId('asamblea-export-all'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'registros-la-anduela.xlsx', 'application/xlsx-test'));
    const models = jest.mocked(buildWorkbook).mock.calls[0]![0];
    expect(models.map((m) => m.sheetName)).toEqual(['Libro de socios', 'Actas', expect.stringMatching(/^Cuentas \d{4}$/)]);
  });

  it('says so when the export fails', async () => {
    setWatched('tasks', [asambleaTask(dayFromToday(5))]);
    jest.mocked(downloadFile).mockRejectedValueOnce(new Error('no share'));
    const { getByTestId } = renderFolder();
    fireEvent.press(getByTestId('asamblea-export-all'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  });

  it('exports the libro and the year as Excel', async () => {
    const libro = renderLibro();
    fireEvent.press(libro.getByTestId('libro-export'));
    fireEvent.press(libro.getByTestId('libro-export-xlsx'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'libro-socios-la-anduela.xlsx', 'application/xlsx-test'));
    libro.unmount();
    const year = renderYear();
    fireEvent.press(year.getByTestId('year-export'));
    fireEvent.press(year.getByTestId('year-export-xlsx'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(ArrayBuffer), `cuentas-${YEAR}-la-anduela.xlsx`, 'application/xlsx-test'));
  });
});

describe('Libro de socios', () => {
  it('counts altas and bajas, and lists every row by alta with its socio number', () => {
    const { getByTestId } = renderLibro();
    expect(within(getByTestId('libro-socios')).getByTestId('libro-row-Ana')).toBeTruthy();
    expect(getByTestId('libro-summary')).toHaveTextContent(/groups\.records\.libro\.summary:2\|1/);
    expect(getByTestId('libro-row-Benito')).toHaveTextContent(/^Benito/);
    expect(getByTestId('libro-row-Benito')).toHaveTextContent(/groups\.records\.libro\.altaBaja/);
    expect(getByTestId('libro-row-Carla')).toHaveTextContent(/^groups\.records\.libro\.numbered:57\|Carla/);
  });

  it('exports the libro as CSV', async () => {
    const { getByTestId } = renderLibro();
    fireEvent.press(getByTestId('libro-export'));
    fireEvent.press(getByTestId('libro-export-csv'));
    await waitFor(() =>
      expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining('Benito'), 'libro-socios-la-anduela.csv', 'text/csv;charset=utf-8'),
    );
  });
});

describe('Actas', () => {
  it('writes an acta with the socios present, the agenda and the acuerdos, one per line', async () => {
    const { getByTestId } = renderActas();
    fireEvent.press(getByTestId('acta-new'));
    fireEvent.press(getByTestId('acta-body-junta_directiva'));
    fireEvent.changeText(getByTestId('acta-place'), 'Bar de la plaza');
    fireEvent.press(getByTestId('acta-next'));
    fireEvent.press(getByTestId('acta-attendee-Ana'));
    fireEvent.changeText(getByTestId('acta-others'), '2');
    fireEvent.press(getByTestId('acta-next'));
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
    const { getByTestId } = renderActas();
    fireEvent.press(getByTestId('acta-new'));
    expect(getByTestId('acta-sheet')).toBeTruthy();
    expect(within(getByTestId('acta-body')).getByTestId('acta-body-asamblea_general')).toBeTruthy();
    fireEvent.changeText(getByTestId('acta-title'), 'Asamblea extraordinaria');
    expect(getByTestId('acta-scroll')).toBeTruthy();
    fireEvent.press(getByTestId('acta-next'));
    fireEvent.press(getByTestId('acta-attendees-all'));
    fireEvent.press(getByTestId('acta-attendees-none'));
    fireEvent.press(getByTestId('acta-attendee-Carla'));
    fireEvent.press(getByTestId('acta-next'));
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
    const { getByTestId, getByText, queryByTestId } = renderActas();
    fireEvent.press(getByTestId('acta-new'));
    fireEvent.press(getByTestId('acta-next'));
    expect(queryByTestId('acta-attendee-Benito')).toBeNull();
    fireEvent.changeText(getByTestId('acta-others'), 'dos');
    expect(getByText('groups.records.actas.form.othersInvalid')).toBeTruthy();
    // The count is wrong, so the step does not move on to the acuerdos.
    fireEvent.press(getByTestId('acta-next'));
    expect(queryByTestId('acta-agenda')).toBeNull();
    expect(createActa).not.toHaveBeenCalled();
  });

  it('opens an acta, shares its text, and shares it with the socios through an edit', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { getByTestId } = renderActas();
    expect(getByTestId('acta-row-a1')).toHaveTextContent(/groups\.records\.actas\.hidden/);
    fireEvent.press(getByTestId('acta-row-a1'));
    expect(within(getByTestId('acta-detail-scroll')).getByText('1. Se aprueban las cuentas')).toBeTruthy();
    fireEvent.press(getByTestId('acta-share'));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('ACTA — Asamblea general\nLa Anduela') });

    fireEvent.press(getByTestId('acta-edit'));
    fireEvent.press(getByTestId('step-dot-2'));
    fireEvent(getByTestId('acta-visible'), 'onValueChange', true);
    fireEvent.press(getByTestId('acta-save'));
    await waitFor(() =>
      expect(updateActa).toHaveBeenCalledWith('org1', 'a1', expect.objectContaining({ visibleToSocios: true, agenda: ['Cuentas'] }), 'u-admin'),
    );
  });

  it('scrolls itself, with Nueva acta floating outside the page', () => {
    const { getByTestId } = render(<ActasAdmin orgId="org1" orgName="La Anduela" uid="u-admin" testID="group-section-screen-actas" />);
    expect(getByTestId('group-section-screen-actas')).toContainElement(getByTestId('actas-admin'));
    expect(getByTestId('group-section-screen-actas')).not.toContainElement(getByTestId('acta-new'));
  });

  it('deletes an acta after confirming', async () => {
    const { getByTestId } = renderActas();
    expect(within(getByTestId('actas-admin')).getByTestId('acta-row-a1')).toBeTruthy();
    fireEvent.press(getByTestId('acta-row-a1'));
    fireEvent.press(getByTestId('acta-delete'));
    expect(deleteActa).not.toHaveBeenCalled();
    pressConfirm();
    await waitFor(() => expect(deleteActa).toHaveBeenCalledWith('org1', 'a1'));
  });
});

describe('Cuentas del año', () => {
  it('adds the cuota income to the other entries and shows the balance', () => {
    const { getByTestId } = renderYear();
    expect(latestWatcher('ledger').args).toEqual(['org1', YEAR]);
    expect(within(getByTestId('year-summary')).getByTestId('year-balance')).toHaveTextContent(/-90,00/);
    expect(within(getByTestId('year-totals')).getByText('groups.records.year.cuotas')).toBeTruthy();
    expect(getByTestId('ledger-entry-e1')).toHaveTextContent(/Orquesta/);
  });

  /** Opens the sheet and fills its first step: the kind and how much. */
  function noteAmount(utils: ReturnType<typeof renderYear>, amount: string, kind: 'income' | 'expense' = 'expense') {
    fireEvent.press(utils.getByTestId('ledger-add'));
    if (kind === 'income') fireEvent.press(within(utils.getByTestId('ledger-kind')).getByTestId('ledger-kind-income'));
    fireEvent.changeText(utils.getByTestId('ledger-amount'), amount);
    fireEvent.press(utils.getByTestId('ledger-next'));
  }

  it('notes an expense in two steps, and reverses a wrong one after confirming', async () => {
    const utils = renderYear();
    const { getByTestId, queryByTestId } = utils;
    fireEvent.press(getByTestId('ledger-add'));
    expect(within(getByTestId('ledger-sheet')).getByTestId('ledger-scroll')).toBeTruthy();
    // No amount, no second step; a wrong one says so.
    fireEvent.press(getByTestId('ledger-next'));
    expect(queryByTestId('ledger-concept')).toBeNull();
    fireEvent.changeText(getByTestId('ledger-amount'), '0');
    expect(utils.getByText('groups.records.year.form.amountInvalid')).toBeTruthy();
    fireEvent.changeText(getByTestId('ledger-amount'), '45,50');
    fireEvent.press(getByTestId('ledger-next'));
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
    const utils = renderYear();
    noteAmount(utils, '300', 'income');
    fireEvent.changeText(utils.getByTestId('ledger-concept'), 'Lotería de Navidad');
    fireEvent.press(utils.getByTestId('ledger-category-Lotería'));
    fireEvent.press(utils.getByTestId('ledger-save'));
    await waitFor(() =>
      expect(recordLedgerEntry).toHaveBeenCalledWith(
        'org1',
        expect.objectContaining({ kind: 'income', amountCents: 30000, concept: 'Lotería de Navidad', category: 'Lotería' }),
        'u-admin',
      ),
    );
    expect(createLedgerCategory).not.toHaveBeenCalled();
  });

  it('offers only the categories of the chosen kind, past names included, and none chosen saves no category', async () => {
    const utils = renderYear();
    const { getByTestId, queryByTestId, getByText } = utils;
    noteAmount(utils, '10');
    expect(within(getByTestId('ledger-category')).getByTestId('ledger-category-new')).toBeTruthy();
    // Gasto by default: the stored Orquesta and Fiestas, which only a past entry used.
    expect(getByTestId('ledger-category-Orquesta')).toBeTruthy();
    expect(getByTestId('ledger-category-Fiestas')).toBeTruthy();
    expect(queryByTestId('ledger-category-Lotería')).toBeNull();
    fireEvent.press(getByText('common.stepper.back'));
    fireEvent.press(within(getByTestId('ledger-kind')).getByTestId('ledger-kind-income'));
    fireEvent.press(getByTestId('ledger-next'));
    expect(getByTestId('ledger-category-Lotería')).toBeTruthy();
    expect(queryByTestId('ledger-category-Orquesta')).toBeNull();

    fireEvent.changeText(getByTestId('ledger-concept'), 'Donativo');
    fireEvent.press(getByTestId('ledger-save'));
    await waitFor(() =>
      expect(recordLedgerEntry).toHaveBeenCalledWith('org1', expect.objectContaining({ kind: 'income', category: null }), 'u-admin'),
    );
  });

  it('picking a name only past entries used adds it to the list', async () => {
    const utils = renderYear();
    noteAmount(utils, '50');
    fireEvent.press(utils.getByTestId('ledger-category-Fiestas'));
    expect(createLedgerCategory).toHaveBeenCalledWith('org1', { kind: 'expense', name: 'Fiestas' }, 'u-admin');
    fireEvent.changeText(utils.getByTestId('ledger-concept'), 'Cohetes');
    fireEvent.press(utils.getByTestId('ledger-save'));
    await waitFor(() =>
      expect(recordLedgerEntry).toHaveBeenCalledWith('org1', expect.objectContaining({ category: 'Fiestas' }), 'u-admin'),
    );
  });

  it('"+ Nueva" creates a category on the spot and chooses it; an existing name in another case is reused', async () => {
    const utils = renderYear();
    const { getByTestId } = utils;
    noteAmount(utils, '200');
    fireEvent.press(getByTestId('ledger-category-new'));
    fireEvent.changeText(getByTestId('ledger-category-name'), '  Seguro  ');
    fireEvent.press(getByTestId('ledger-category-add'));
    expect(createLedgerCategory).toHaveBeenCalledWith('org1', { kind: 'expense', name: 'Seguro' }, 'u-admin');

    fireEvent.press(getByTestId('ledger-category-new'));
    fireEvent.changeText(getByTestId('ledger-category-name'), 'orquesta');
    fireEvent.press(getByTestId('ledger-category-add'));
    expect(createLedgerCategory).toHaveBeenCalledTimes(1);
    expect(getByTestId('ledger-category-Orquesta')).toHaveProp('accessibilityState', { selected: true });

    fireEvent.changeText(getByTestId('ledger-concept'), 'Verbena');
    fireEvent.press(getByTestId('ledger-save'));
    await waitFor(() =>
      expect(recordLedgerEntry).toHaveBeenCalledWith('org1', expect.objectContaining({ category: 'Orquesta' }), 'u-admin'),
    );
  });

  it('the Categorías sheet renames and deletes, and refuses a name already taken', () => {
    const { getByTestId, getByText } = renderYear();
    fireEvent.press(getByTestId('ledger-categories-open'));
    expect(getByTestId('ledger-categories-sheet')).toBeTruthy();
    expect(within(getByTestId('ledger-category-row-expense_orquesta')).getByText('Orquesta')).toBeTruthy();
    expect(within(getByTestId('ledger-categories-expense')).getByText('Orquesta')).toBeTruthy();
    expect(within(getByTestId('ledger-categories-income')).getByText('Lotería')).toBeTruthy();

    fireEvent.press(getByTestId('ledger-category-rename-expense_orquesta'));
    fireEvent.changeText(getByTestId('ledger-category-rename-input-expense_orquesta'), '   ');
    fireEvent.press(getByTestId('ledger-category-rename-save-expense_orquesta'));
    expect(getByText('groups.records.categories.nameRequired')).toBeTruthy();
    fireEvent.changeText(getByTestId('ledger-category-rename-input-expense_orquesta'), 'Música');
    fireEvent.press(getByTestId('ledger-category-rename-save-expense_orquesta'));
    expect(renameLedgerCategory).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'expense_orquesta' }), 'Música', 'u-admin');

    fireEvent.press(getByTestId('ledger-category-delete-income_loter%C3%ADa'));
    pressConfirm();
    expect(deleteLedgerCategory).toHaveBeenCalledWith('org1', 'income_loter%C3%ADa');
  });

  it('a rename to a name the kind already has is refused', () => {
    setWatched('ledgerCategories', [ORQUESTA, { id: 'expense_bar', ...buildLedgerCategoryData({ name: 'Bar', kind: 'expense', createdBy: 'u-admin' }) }]);
    const { getByTestId, getByText } = renderYear();
    fireEvent.press(getByTestId('ledger-categories-open'));
    fireEvent.press(getByTestId('ledger-category-rename-expense_orquesta'));
    fireEvent.changeText(getByTestId('ledger-category-rename-input-expense_orquesta'), 'BAR');
    fireEvent.press(getByTestId('ledger-category-rename-save-expense_orquesta'));
    expect(getByText('groups.records.categories.nameTaken')).toBeTruthy();
    expect(renameLedgerCategory).not.toHaveBeenCalled();
  });

  it('scrolls itself, with the button to note a movement floating outside the page', () => {
    const { getByTestId } = render(<YearSummaryAdmin orgId="org1" orgName="La Anduela" uid="u-admin" testID="group-section-screen-cuentas" />);
    expect(getByTestId('group-section-screen-cuentas')).toContainElement(getByTestId('year-summary'));
    expect(getByTestId('group-section-screen-cuentas')).not.toContainElement(getByTestId('ledger-add'));
  });

  it('never steps past the current year', () => {
    const { getByTestId } = renderYear();
    expect(getByTestId('year-label')).toHaveTextContent(YEAR);
    fireEvent.press(getByTestId('year-next'));
    expect(getByTestId('year-label')).toHaveTextContent(YEAR);
    fireEvent.press(getByTestId('year-prev'));
    fireEvent.press(getByTestId('year-next'));
    expect(getByTestId('year-label')).toHaveTextContent(YEAR);
  });

  it('steps back a year and exports the summary', async () => {
    const { getByTestId } = renderYear();
    fireEvent.press(getByTestId('year-prev'));
    expect(latestWatcher('ledger').args).toEqual(['org1', String(Number(YEAR) - 1)]);
    fireEvent.press(getByTestId('year-export'));
    fireEvent.press(getByTestId('year-export-csv'));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^cuentas-\d{4}-la-anduela\.csv$/), 'text/csv;charset=utf-8'));
  });
});
