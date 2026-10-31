import { render, fireEvent } from '@testing-library/react-native';
import { GroupSummary } from '../GroupSummary';

type Status = { socioId: string; status: 'al_dia' | 'pendiente' | 'vencida' };

let mockEvents: { id: string; title: string; startDate: Date; endDate: Date | null }[] = [];
let mockMine: { id: string; title: string; dueOn: string | null }[] = [];
let mockCuota: { periodKey: string | null; rows: { id: string; kind: string }[]; statuses: Status[]; settled: boolean } = {
  periodKey: null,
  rows: [],
  statuses: [],
  settled: true,
};

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string, p?: Record<string, string>) => (p ? `${k}:${Object.values(p).join(',')}` : k) }),
}));
jest.mock('../../../../lib/hooks/useWatch', () => ({ useWatch: () => ({ data: mockEvents, status: 'ready', error: null }) }));
jest.mock('@cultuvilla/shared/services/eventService', () => ({ watchEventsByOrganization: jest.fn() }));
jest.mock('../../../../lib/orgs/useMyOpenTasks', () => ({ useMyOpenTasks: () => ({ mine: mockMine, shifts: [], status: 'ready' }) }));
jest.mock('../../../../lib/orgs/useMyCuota', () => ({ useMyCuota: () => mockCuota }));

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

beforeEach(() => {
  mockEvents = [];
  mockMine = [];
  mockCuota = { periodKey: null, rows: [], statuses: [], settled: true };
});

describe('GroupSummary', () => {
  it('says nothing is pending when there is nothing to show', () => {
    const { getByTestId } = render(<GroupSummary orgId="o1" uid="u1" roster includePrivate={false} onOpen={jest.fn()} />);
    expect(getByTestId('group-summary-empty')).toBeTruthy();
  });

  it('shows the next upcoming event, skipping past ones, and my next task', () => {
    mockEvents = [
      { id: 'old', title: 'Matanza 2025', startDate: day(-300), endDate: null },
      { id: 'later', title: 'Comida', startDate: day(60), endDate: null },
      { id: 'next', title: 'Matanza 2026', startDate: day(10), endDate: null },
    ];
    mockMine = [{ id: 't1', title: 'Comprar leña', dueOn: null }];
    const onOpen = jest.fn();
    const { getByTestId, getByText, queryByText } = render(<GroupSummary orgId="o1" uid="u1" roster includePrivate={false} onOpen={onOpen} />);
    expect(getByText('Matanza 2026')).toBeTruthy();
    expect(queryByText('Matanza 2025')).toBeNull();
    expect(getByText('Comprar leña')).toBeTruthy();
    fireEvent.press(getByTestId('group-summary-event'));
    expect(onOpen).toHaveBeenCalledWith('eventos');
    fireEvent.press(getByTestId('group-summary-task'));
    expect(onOpen).toHaveBeenCalledWith('tareas');
  });

  it("shows the member's own cuota status, opening the cuota screen", () => {
    mockCuota = {
      periodKey: '2026',
      rows: [
        { id: 'p1', kind: 'persona' },
        { id: 's1', kind: 'member' },
      ],
      statuses: [
        { socioId: 'p1', status: 'al_dia' },
        { socioId: 's1', status: 'vencida' },
      ],
      settled: true,
    };
    const onOpen = jest.fn();
    const { getByTestId, getByText } = render(<GroupSummary orgId="o1" uid="u1" roster includePrivate={false} onOpen={onOpen} />);
    expect(getByText('groups.cuota.status.vencida')).toBeTruthy();
    fireEvent.press(getByTestId('group-summary-cuota'));
    expect(onOpen).toHaveBeenCalledWith('cuota');
  });

  it('shows no cuota for an org without a roster', () => {
    mockCuota = { periodKey: '2026', rows: [{ id: 's1', kind: 'member' }], statuses: [{ socioId: 's1', status: 'vencida' }], settled: true };
    const { queryByTestId } = render(<GroupSummary orgId="o1" uid="u1" roster={false} includePrivate={false} onOpen={jest.fn()} />);
    expect(queryByTestId('group-summary-cuota')).toBeNull();
  });
});
