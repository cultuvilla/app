import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { RosterExportButton } from '../RosterExportButton';
import { downloadFile } from '../../../lib/export/downloadFile';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/export/downloadFile', () => ({ downloadFile: jest.fn() }));
const mockBuildWorkbook = jest.fn();
jest.mock('../../../lib/export/rosterWorkbook', () => ({
  __esModule: true,
  XLSX_MIME: 'application/xlsx-test',
  buildRosterWorkbook: (...args: unknown[]) => mockBuildWorkbook(...args),
}));

const mockDownload = downloadFile as jest.Mock;

const registration = {
  id: 'r1',
  userId: 'u1',
  personId: 'p1',
  name: 'Ana Pérez',
  status: 'confirmed' as const,
  position: 1,
  registeredAt: new Date('2026-07-02T10:30:00Z'),
  isMember: true,
  checkedInAt: null,
  paidAt: null,
  photoURL: null,
  personUserId: null,
  isPersonPublic: true,
  groupId: null,
  groupOwnerId: null,
  isOpenSeat: false,
};

const props = {
  eventTitle: 'Fiesta de San Juan',
  eventDate: new Date('2026-06-24T20:00:00Z'),
  registrations: [registration],
  phones: {},
  telephoneRequired: false,
  requiresPayment: false,
};

describe('RosterExportButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDownload.mockResolvedValue(undefined);
    mockBuildWorkbook.mockResolvedValue(new ArrayBuffer(8));
  });

  it('renders nothing when there is nobody signed up', () => {
    render(<RosterExportButton {...props} registrations={[]} />);
    expect(screen.queryByTestId('export-roster')).toBeNull();
  });

  it('downloads a branded .xlsx by default', async () => {
    render(<RosterExportButton {...props} />);
    fireEvent.press(screen.getByTestId('export-roster'));
    fireEvent.press(screen.getByTestId('export-roster-xlsx'));

    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    const [, fileName, mime] = mockDownload.mock.calls[0]!;
    expect(fileName).toBe('asistentes-fiesta-de-san-juan.xlsx');
    expect(mime).toBe('application/xlsx-test');
    expect(mockBuildWorkbook).toHaveBeenCalledTimes(1);
  });

  it('downloads a UTF-8 CSV when CSV is chosen, without building a workbook', async () => {
    render(<RosterExportButton {...props} />);
    fireEvent.press(screen.getByTestId('export-roster'));
    fireEvent.press(screen.getByTestId('export-roster-csv'));

    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    const [contents, fileName, mime] = mockDownload.mock.calls[0]!;
    expect(fileName).toBe('asistentes-fiesta-de-san-juan.csv');
    expect(mime).toBe('text/csv;charset=utf-8');
    expect(contents).toContain('Ana Pérez');
    expect(mockBuildWorkbook).not.toHaveBeenCalled();
  });

  it('carries the event questions and each attendee answer into the file', async () => {
    render(
      <RosterExportButton
        {...props}
        signupFields={[
          { id: 'f1', label: 'Talla', type: 'text', required: true, options: [] },
          { id: 'f2', label: 'Bus', type: 'checkbox', required: false, options: [] },
        ]}
        answers={{ r1: { f1: 'M', f2: true } }}
      />,
    );
    fireEvent.press(screen.getByTestId('export-roster'));
    fireEvent.press(screen.getByTestId('export-roster-csv'));

    await waitFor(() => expect(mockDownload).toHaveBeenCalled());
    const [contents] = mockDownload.mock.calls[0]!;
    const [header, row] = (contents as string).trim().split('\r\n');
    expect(header).toContain('Talla;Bus');
    expect(row).toContain('M;Sí');
  });

  it('surfaces an error instead of a silent no-op when generation fails', async () => {
    mockBuildWorkbook.mockRejectedValue(new Error('boom'));
    render(<RosterExportButton {...props} />);
    fireEvent.press(screen.getByTestId('export-roster'));
    fireEvent.press(screen.getByTestId('export-roster-xlsx'));

    await waitFor(() => screen.getByText('event.export.error'));
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('surfaces an error when the handoff itself fails, not only generation', async () => {
    // On native the file is written and shared *after* the workbook is built,
    // so a rejection there must reach the same error state.
    mockDownload.mockRejectedValue(new Error('no share sheet'));
    render(<RosterExportButton {...props} />);
    fireEvent.press(screen.getByTestId('export-roster'));
    fireEvent.press(screen.getByTestId('export-roster-csv'));

    await waitFor(() => expect(screen.getByText('event.export.error')).toBeTruthy());
  });

  it('is offered on native too — the control no longer depends on the web build', () => {
    render(<RosterExportButton {...props} />);
    expect(screen.getByTestId('export-roster')).toBeTruthy();
  });
});
