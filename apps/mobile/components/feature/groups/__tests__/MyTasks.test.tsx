import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import { respondToTaskShift, setGroupTaskDone } from '@cultuvilla/shared/services/groupTaskService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { MyTasks } from '../MyTasks';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k),
  }),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  watchOpenGroupTasks: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('open'),
  setGroupTaskDone: jest.fn().mockResolvedValue(undefined),
  respondToTaskShift: jest.fn().mockResolvedValue('claimed'),
}));
jest.mock('../../../../lib/orgs/useOrgMembers', () => ({
  useOrgMembers: () => ({ members: [], nameOf: (uid: string) => `name-${uid}` }),
}));

const FUTURE = `${String(Number(madridDayKey(new Date()).slice(0, 4)) + 1)}-08-14`;

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
});

describe('MyTasks', () => {
  it('shows nothing when the member holds no task and no shift is open', () => {
    setWatched('open', [task('other', { assigneeUids: ['u2'] })]);
    const { queryByTestId } = render(<MyTasks orgId="org1" uid="u1" isAdmin={false} />);
    expect(queryByTestId('my-tasks')).toBeNull();
  });

  it('lists my open tasks, and ticking one marks it done', async () => {
    setWatched('open', [task('mine', { assigneeUids: ['u1'], dueOn: FUTURE }), task('theirs', { assigneeUids: ['u2'] })]);
    const { getByTestId, queryByTestId } = render(<MyTasks orgId="org1" uid="u1" isAdmin={false} />);
    expect(getByTestId('task-row-mine')).toHaveTextContent(/groups\.tasks\.due:/);
    expect(queryByTestId('task-row-theirs')).toBeNull();
    fireEvent.press(getByTestId('task-tick-mine'));
    await waitFor(() => expect(setGroupTaskDone).toHaveBeenCalledWith('org1', 'mine', true, 'u1'));
  });

  it('offers an open shift: claim it or say no', async () => {
    setWatched('open', [task('montaje', { slots: 3, dueOn: FUTURE, time: '10:00', claimedUids: ['u2'] })]);
    const { getByTestId, queryByTestId } = render(<MyTasks orgId="org1" uid="u1" isAdmin={false} />);
    expect(getByTestId('shift-montaje')).toHaveTextContent(/groups\.tasks\.shift\.slots:1\|3/);
    expect(queryByTestId('shift-names-montaje')).toBeNull();
    fireEvent.press(getByTestId('shift-claim-montaje'));
    await waitFor(() => expect(respondToTaskShift).toHaveBeenCalledWith('org1', 'montaje', 'claim'));
    expect(getByTestId('shift-decline-montaje')).toBeTruthy();
  });

  it('a full shift offers the waiting list; a member in it can step out', () => {
    setWatched('open', [
      task('full', { slots: 1, dueOn: FUTURE, claimedUids: ['u2'] }),
      task('waiting', { slots: 1, dueOn: FUTURE, claimedUids: ['u2'], waitlistUids: ['u3', 'u1'] }),
    ]);
    const { getByTestId, queryByTestId } = render(<MyTasks orgId="org1" uid="u1" isAdmin />);
    expect(getByTestId('shift-claim-full')).toHaveTextContent('groups.tasks.shift.joinWaitlist');
    expect(getByTestId('shift-state-waiting')).toHaveTextContent('groups.tasks.shift.state.waitlisted:2');
    expect(getByTestId('shift-withdraw-waiting')).toHaveTextContent('groups.tasks.shift.leaveWaitlist');
    expect(queryByTestId('shift-claim-waiting')).toBeNull();
    // Admins see who is in.
    expect(getByTestId('shift-names-full')).toHaveTextContent(/name-u2/);
  });

  it('hides a shift whose day has passed', () => {
    setWatched('open', [task('past', { slots: 2, dueOn: '2020-01-01' })]);
    const { queryByTestId } = render(<MyTasks orgId="org1" uid="u1" isAdmin={false} />);
    expect(queryByTestId('my-tasks')).toBeNull();
  });
});
