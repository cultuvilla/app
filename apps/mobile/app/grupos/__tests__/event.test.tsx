import { fireEvent, render } from '@testing-library/react-native';
import GroupEventScreen from '../[grupo]/evento/[evento]';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';

const mockPush = jest.fn();
const mockRedirect = jest.fn((_props: { href: string }) => null);
let mockGroups: { org: { id: string }; role: string }[] = [];
let mockEvent: { id: string; title: string; startDate: Date; imageURL: null; villageCoverImage: null; location: null; villageSlug: string } | null = null;
let mockTasks: Partial<GroupTask>[] = [];

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href) },
  useLocalSearchParams: () => ({ grupo: 'Anduela', evento: 'e1' }),
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
jest.mock('../../../lib/orgs/useMyGroups', () => ({ useMyGroups: () => ({ groups: mockGroups, status: 'ready' }) }));
jest.mock('../../../lib/orgs/useOrgMembers', () => ({ useOrgMembers: () => ({ members: [], nameOf: (id: string) => id }) }));
jest.mock('../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string) =>
    label === 'groups:watchEvent' ? { data: mockEvent, status: 'ready' } : { data: mockTasks, status: 'ready' },
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({
  ScreenHeader: ({ title }: { title: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text testID="screen-title">{title}</Text>;
  },
}));
jest.mock('../../../components/feature/groups/TaskRows', () => ({
  TaskRow: ({ task, onEdit }: { task: GroupTask; onEdit: () => void }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <Text testID={`row-${task.id}`} onPress={onEdit}>
        {task.title}
      </Text>
    );
  },
}));
jest.mock('../../../components/feature/groups/TaskSheet', () => ({
  TaskSheet: ({ visible, eventId }: { visible: boolean; eventId: string }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="task-sheet">{eventId}</Text> : null;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGroups = [{ org: { id: 'Anduela' }, role: 'member' }];
  mockEvent = { id: 'e1', title: 'Matanza', startDate: new Date('2026-12-06T10:00:00Z'), imageURL: null, villageCoverImage: null, location: null, villageSlug: 'v' };
  mockTasks = [
    { id: 'later', title: 'Vino', dueOn: '2026-12-05', time: null, doneAt: null },
    { id: 'soon', title: 'Leña', dueOn: '2026-12-01', time: null, doneAt: null },
  ];
});

describe("a group's event screen", () => {
  it('lists the event tasks by date, adds to them, and opens each on its own screen', () => {
    const { getByTestId, getAllByTestId } = render(<GroupEventScreen />);
    expect(getByTestId('group-event')).toBeTruthy();
    expect(getByTestId('screen-title')).toHaveTextContent('Matanza');
    expect(getAllByTestId(/^row-/).map((el) => el.props.testID as string)).toEqual(['row-soon', 'row-later']);
    fireEvent.press(getByTestId('group-event-add-task'));
    expect(getByTestId('task-sheet')).toHaveTextContent('e1');
    fireEvent.press(getByTestId('row-soon'));
    expect(mockPush).toHaveBeenCalledWith('/grupos/Anduela/tarea/soon');
  });

  it('keeps the public page one button away', () => {
    const { getByTestId } = render(<GroupEventScreen />);
    fireEvent.press(getByTestId('group-event-public-page'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/v/evento/'));
  });

  it('says so when the event is gone', () => {
    mockEvent = null;
    expect(render(<GroupEventScreen />).getByTestId('group-event-unavailable')).toBeTruthy();
  });

  it('sends someone outside the group back to the tab', () => {
    mockGroups = [];
    render(<GroupEventScreen />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/(tabs)/grupos' });
  });
});
