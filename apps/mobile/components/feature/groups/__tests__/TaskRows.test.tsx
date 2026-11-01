import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { respondToTaskShift } from '@cultuvilla/shared/services/groupTaskService';
import { ShiftBar, TaskRow } from '../TaskRows';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  respondToTaskShift: jest.fn().mockResolvedValue('claimed'),
}));

const FUTURE = `${String(Number(madridDayKey(new Date()).slice(0, 4)) + 1)}-08-14`;
const nameOf = (uid: string) => `name-${uid}`;

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const shift = (t: ReturnType<typeof task>) => render(<ShiftBar task={t} orgId="org1" uid="u1" />);

beforeEach(() => jest.clearAllMocks());

describe('TaskRow', () => {
  it('ticking one reports it done', () => {
    const onTick = jest.fn();
    const { getByTestId } = render(<TaskRow task={task('mine', { assigneeUids: ['u1'], dueOn: FUTURE })} canTick onTick={onTick} nameOf={nameOf} />);
    expect(getByTestId('task-row-mine')).toHaveTextContent(/groups\.tasks\.due:/);
    fireEvent.press(getByTestId('task-tick-mine'));
    expect(onTick).toHaveBeenCalledWith(true);
  });
});

describe('ShiftBar', () => {
  it('offers an open shift: claim it or say no', async () => {
    const { getByTestId } = shift(task('montaje', { slots: 3, dueOn: FUTURE, time: '10:00', claimedUids: ['u2'] }));
    expect(getByTestId('shift-montaje')).toHaveTextContent(/groups\.tasks\.shift\.slots:1\|3/);
    fireEvent.press(getByTestId('shift-claim-montaje'));
    await waitFor(() => expect(respondToTaskShift).toHaveBeenCalledWith('org1', 'montaje', 'claim'));
    expect(getByTestId('shift-decline-montaje')).toBeTruthy();
  });

  it('a full shift offers the waiting list', () => {
    const { getByTestId } = shift(task('full', { slots: 1, dueOn: FUTURE, claimedUids: ['u2'] }));
    expect(getByTestId('shift-claim-full')).toHaveTextContent('groups.tasks.shift.joinWaitlist');
  });

  it('a member on the waiting list can step out', () => {
    const { getByTestId, queryByTestId } = shift(task('waiting', { slots: 1, dueOn: FUTURE, claimedUids: ['u2'], waitlistUids: ['u3', 'u1'] }));
    expect(getByTestId('shift-state-waiting')).toHaveTextContent('groups.tasks.shift.state.waitlisted:2');
    expect(getByTestId('shift-withdraw-waiting')).toHaveTextContent('groups.tasks.shift.leaveWaitlist');
    expect(queryByTestId('shift-claim-waiting')).toBeNull();
  });
});
