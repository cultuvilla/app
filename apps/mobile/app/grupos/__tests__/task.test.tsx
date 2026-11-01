import { Keyboard } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { setGroupTaskDone } from '@cultuvilla/shared/services/groupTaskService';
import GroupTaskScreen from '../[grupo]/tarea/[tarea]';

const mockPush = jest.fn();
const mockRedirect = jest.fn((_props: { href: string }) => null);
let mockGroups: { org: { id: string }; role: string }[] = [];
let mockTask: unknown = null;

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
  useLocalSearchParams: () => ({ grupo: 'Anduela', tarea: 't1' }),
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  setGroupTaskDone: jest.fn().mockResolvedValue(undefined),
  watchGroupTask: jest.fn(),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/orgs/useOrgMembers', () => ({
  useMemberFaces: () => ({}),
  useOrgMembers: () => ({ members: [], nameOf: (id: string) => `name-${id}` }),
}));
jest.mock('../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string) =>
    label === 'groups:watchGroupTask'
      ? { data: mockTask, status: 'ready' }
      : { data: { id: 'e1', title: 'Matanza' }, status: 'ready' },
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));
jest.mock('../../../components/feature/groups/TaskComments', () => ({
  TaskComments: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="task-comments">comments</Text>;
  },
}));
jest.mock('../../../components/feature/groups/TaskRows', () => ({
  ShiftBar: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="stub-shift">shift</Text>;
  },
}));
jest.mock('../../../components/feature/groups/TaskSheet', () => ({
  TaskSheet: ({ visible, canDelete }: { visible: boolean; canDelete: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="stub-sheet">{String(canDelete)}</Text> : null;
  },
}));

function task(over: Partial<GroupTaskData> = {}) {
  return { id: 't1', ...buildGroupTaskData({ title: 'Comprar leña', createdBy: 'other', createdAt: new Date() }), ...over };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGroups = [{ org: { id: 'Anduela' }, role: 'member' }];
  mockTask = task({ assigneeUids: ['a1', 'a2'], eventId: 'e1' });
});

describe("a group's task screen", () => {
  it('shows who is on it and the event it is for', () => {
    const { getByTestId } = render(<GroupTaskScreen />);
    expect(getByTestId('group-task')).toBeTruthy();
    expect(getByTestId('group-task-person-a1')).toHaveTextContent(/name-a1/);
    expect(getByTestId('group-task-person-a2')).toBeTruthy();
    fireEvent.press(getByTestId('group-task-event'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/evento/e1');
  });

  it('a shift shows its volunteers and its answer', () => {
    mockTask = task({ slots: 3, dueOn: '2030-01-01', claimedUids: ['a3'] });
    const { getByTestId } = render(<GroupTaskScreen />);
    expect(getByTestId('group-task-person-a3')).toBeTruthy();
    expect(getByTestId('stub-shift')).toBeTruthy();
  });

  it('closes an open task and reopens a closed one', async () => {
    const open = render(<GroupTaskScreen />);
    fireEvent.press(open.getByTestId('group-task-done'));
    await waitFor(() => expect(setGroupTaskDone).toHaveBeenCalledWith('Anduela', 't1', true, 'u1'));
    open.unmount();

    mockTask = task({ doneAt: new Date(), doneBy: 'u1' });
    const closed = render(<GroupTaskScreen />);
    expect(closed.getByTestId('group-task-done')).toHaveTextContent('groups.tasks.detail.reopen');
    fireEvent.press(closed.getByTestId('group-task-done'));
    await waitFor(() => expect(setGroupTaskDone).toHaveBeenCalledWith('Anduela', 't1', false, 'u1'));
  });

  it('has its comments on the page, under the details', () => {
    const { getByTestId } = render(<GroupTaskScreen />);
    expect(getByTestId('group-task')).toContainElement(getByTestId('task-comments'));
    expect(getByTestId('group-task-done')).toBeTruthy();
  });

  it('pins the answer to a shift outside the page, until the keyboard needs the room', () => {
    const listeners: { event: string; cb: () => void }[] = [];
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      listeners.push({ event, cb });
      return { remove: jest.fn() };
    }) as never);
    const keyboard = (event: string) => act(() => listeners.filter((l) => l.event === event).forEach((l) => l.cb()));
    mockTask = task({ slots: 3, dueOn: '2030-01-01' });
    const { getByTestId, queryByTestId } = render(<GroupTaskScreen />);
    expect(getByTestId('group-task')).not.toContainElement(getByTestId('stub-shift'));
    keyboard('keyboardDidShow');
    expect(queryByTestId('stub-shift')).toBeNull();
    keyboard('keyboardDidHide');
    expect(getByTestId('stub-shift')).toBeTruthy();
    spy.mockRestore();
  });

  it('offers no answer on a plain task or a closed shift', () => {
    const plain = render(<GroupTaskScreen />);
    expect(plain.queryByTestId('stub-shift')).toBeNull();
    plain.unmount();
    mockTask = task({ slots: 3, dueOn: '2030-01-01', doneAt: new Date(), doneBy: 'u1' });
    expect(render(<GroupTaskScreen />).queryByTestId('stub-shift')).toBeNull();
  });

  it('shows who waits on a shift to admins only', () => {
    mockTask = task({ slots: 1, dueOn: '2030-01-01', claimedUids: ['a3'], waitlistUids: ['a4'] });
    const member = render(<GroupTaskScreen />);
    expect(member.queryByTestId('group-task-waiting')).toBeNull();
    member.unmount();
    mockGroups = [{ org: { id: 'Anduela' }, role: 'admin' }];
    expect(render(<GroupTaskScreen />).getByTestId('group-task-waiting')).toBeTruthy();
  });

  it('lets a member delete only what they created, from the edit form', () => {
    const { getByTestId } = render(<GroupTaskScreen />);
    fireEvent.press(getByTestId('group-task-edit'));
    expect(getByTestId('stub-sheet')).toHaveTextContent('false');
  });

  it('says so when the task is gone, and sends outsiders to the tab', () => {
    mockTask = null;
    const gone = render(<GroupTaskScreen />);
    expect(gone.getByTestId('group-task-unavailable')).toBeTruthy();
    gone.unmount();
    mockGroups = [];
    render(<GroupTaskScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(tabs)/grupos' });
  });
});
