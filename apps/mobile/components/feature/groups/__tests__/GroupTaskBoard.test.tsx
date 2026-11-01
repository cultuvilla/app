import { FlatList } from 'react-native';
import { fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { GroupTaskBoard } from '../GroupTaskBoard';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

const mockPush = jest.fn();
let mockOpen: unknown[] = [];
let mockDone: unknown[] = [];

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string) => ({
    data: label === 'groups:watchOpenGroupTasks' ? mockOpen : label === 'groups:watchGroupTasksDoneSince' ? mockDone : [],
    status: 'ready',
  }),
}));
jest.mock('../../../../lib/orgs/useOrgMembers', () => ({
  useMemberFaces: () => ({}),
  useOrgMembers: () => ({ members: [], nameOf: (id: string) => id }),
}));
jest.mock('../GroupTasks', () => ({
  GroupTasks: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="stub-group-tasks">rest</Text>;
  },
}));
jest.mock('../TaskSheet', () => ({
  TaskSheet: ({ visible }: { visible: boolean }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="stub-task-sheet">sheet</Text> : null;
  },
}));

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const group = { org: { id: 'Anduela', type: 'asociación' }, role: 'member' } as MyGroup;
const shown = (board: RenderResult) =>
  board.getAllByTestId(/^group-home-task-[a-z]+$/).map((el) => (el.props.testID as string).replace('group-home-task-', ''));

beforeEach(() => {
  jest.clearAllMocks();
  mockOpen = [
    task('later', { dueOn: '2030-02-01' }),
    task('soon', { dueOn: '2030-01-01', assigneeUids: ['me'] }),
    task('shift', { dueOn: '2030-01-15', slots: 3, claimedUids: ['me'] }),
  ];
  mockDone = [task('closed', { doneAt: new Date(), doneBy: 'x' })];
});

describe('GroupTaskBoard', () => {
  it('lists every open task by date in two columns, opening its own screen', () => {
    const board = render(<GroupTaskBoard group={group} uid="me" />);
    expect(board.UNSAFE_getByType(FlatList).props.numColumns).toBe(2);
    expect(board.getByTestId('group-task-board')).toBeTruthy();
    expect(board.getByTestId('group-tasks-filter')).toBeTruthy();
    expect(shown(board)).toEqual(['soon', 'shift', 'later']);
    fireEvent.press(board.getByTestId('group-home-task-soon'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/tarea/soon');
  });

  it("filters to the viewer's tasks and to the done ones", () => {
    const board = render(<GroupTaskBoard group={group} uid="me" />);
    fireEvent.press(board.getByTestId('group-tasks-filter-mine'));
    expect(shown(board)).toEqual(['soon', 'shift']);
    fireEvent.press(board.getByTestId('group-tasks-filter-done'));
    expect(shown(board)).toEqual(['closed']);
  });

  it('creates from the button, whatever the filter shows', () => {
    mockOpen = [];
    const board = render(<GroupTaskBoard group={group} uid="me" />);
    expect(board.getByText('groups.tasks.noOpen')).toBeTruthy();
    fireEvent.press(board.getByTestId('group-tasks-create'));
    expect(board.getByTestId('stub-task-sheet')).toBeTruthy();
  });
});
