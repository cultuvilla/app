import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { respondToTaskShift, setGroupTaskAssigned } from '@cultuvilla/shared/services/groupTaskService';
import { TaskRow, TaskSignupBar } from '../TaskRows';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/groupTaskService')>(
      '@cultuvilla/shared/services/groupTaskService',
      () => ({
        respondToTaskShift: jest.fn().mockResolvedValue('claimed'),
        setGroupTaskAssigned: jest.fn().mockResolvedValue(undefined),
      }),
    ),
);

const FUTURE = `${String(Number(madridDayKey(new Date()).slice(0, 4)) + 1)}-08-14`;
const nameOf = (uid: string) => `name-${uid}`;

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const shift = (t: ReturnType<typeof task>) => render(<TaskSignupBar task={t} orgId="org1" uid="u1" />);

beforeEach(() => jest.clearAllMocks());

describe('TaskRow', () => {
  it('ticking one reports it done', () => {
    const onTick = jest.fn();
    const { getByTestId } = render(<TaskRow task={task('mine', { assigneeUids: ['u1'], dueOn: FUTURE })} canTick onTick={onTick} nameOf={nameOf} />);
    expect(getByTestId('task-row-mine')).toHaveTextContent(/groups\.tasks\.due:/);
    fireEvent.press(getByTestId('task-tick-mine'));
    expect(onTick).toHaveBeenCalledWith(true);
  });

  it('says who is in charge and how many volunteers it still looks for, together', () => {
    const { getByTestId } = render(
      <TaskRow task={task('barra', { assigneeUids: ['u1'], slots: 3, dueOn: FUTURE, claimedUids: ['u2'] })} canTick onTick={jest.fn()} nameOf={nameOf} />,
    );
    expect(getByTestId('task-row-barra')).toHaveTextContent(/groups\.tasks\.assignedTo:name-u1 · groups\.tasks\.shift\.slots:1\|3/);
    expect(getByTestId('task-row-barra')).not.toHaveTextContent(/groups\.tasks\.unassigned/);
  });
});

describe('TaskSignupBar', () => {
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

  it('a plain task offers signing up, with no slots to count and no no to give', async () => {
    const { getByTestId, queryByTestId } = shift(task('leña', { assigneeUids: ['u2'] }));
    expect(getByTestId('shift-claim-leña')).toHaveTextContent('groups.tasks.shift.claim');
    expect(getByTestId('shift-leña')).not.toHaveTextContent(/groups\.tasks\.shift\.(slots|full)/);
    expect(queryByTestId('shift-decline-leña')).toBeNull();
    fireEvent.press(getByTestId('shift-claim-leña'));
    await waitFor(() => expect(setGroupTaskAssigned).toHaveBeenCalledWith('org1', 'leña', 'u1', true));
    expect(respondToTaskShift).not.toHaveBeenCalled();
  });

  it('someone already on a plain task can take themselves off', async () => {
    const { getByTestId, queryByTestId } = shift(task('leña', { assigneeUids: ['u1', 'u2'] }));
    expect(getByTestId('shift-state-leña')).toHaveTextContent('groups.tasks.shift.state.claimed');
    expect(queryByTestId('shift-claim-leña')).toBeNull();
    fireEvent.press(getByTestId('shift-withdraw-leña'));
    await waitFor(() => expect(setGroupTaskAssigned).toHaveBeenCalledWith('org1', 'leña', 'u1', false));
  });

  it('an encargado of a task that looks for volunteers is told so, takes no slot, and can step off', async () => {
    const { getByTestId, queryByTestId } = shift(task('barra', { assigneeUids: ['u1'], slots: 3, dueOn: FUTURE, claimedUids: ['u2'] }));
    expect(getByTestId('shift-state-barra')).toHaveTextContent('groups.tasks.shift.state.encargado');
    expect(getByTestId('shift-barra')).toHaveTextContent(/groups\.tasks\.shift\.slots:1\|3/);
    expect(queryByTestId('shift-claim-barra')).toBeNull();
    expect(queryByTestId('shift-decline-barra')).toBeNull();
    fireEvent.press(getByTestId('shift-withdraw-barra'));
    await waitFor(() => expect(setGroupTaskAssigned).toHaveBeenCalledWith('org1', 'barra', 'u1', false));
    expect(respondToTaskShift).not.toHaveBeenCalled();
  });
});
