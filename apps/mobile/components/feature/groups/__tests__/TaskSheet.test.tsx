import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { createGroupTask, deleteGroupTask, updateGroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { TaskSheet } from '../TaskSheet';

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
jest.mock('@cultuvilla/shared/services/groupTaskService', () => ({
  createGroupTask: jest.fn().mockResolvedValue('new'),
  updateGroupTask: jest.fn().mockResolvedValue(undefined),
  deleteGroupTask: jest.fn().mockResolvedValue(undefined),
}));

const MEMBERS = [
  { uid: 'u-ana', name: 'Ana', role: 'member' as const, photoURL: null },
  { uid: 'u-luis', name: 'Luis', role: 'member' as const, photoURL: null },
];

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const sheet = (props: Partial<Parameters<typeof TaskSheet>[0]> = {}) =>
  render(<TaskSheet visible orgId="org1" uid="admin" task={null} members={MEMBERS} onClose={jest.fn()} {...props} />);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('TaskSheet', () => {
  it('creates a yearly task on a fixed date', async () => {
    const { getByTestId } = sheet();
    fireEvent.changeText(getByTestId('task-title'), 'Renovar el seguro');
    fireEvent.press(getByTestId('task-assignee-u-ana'));
    fireEvent.press(getByTestId('task-repeat-calendar'));
    fireEvent.press(getByTestId('task-save'));
    // A fixed-date repeat needs a date.
    expect(getByTestId('task-due-error')).toHaveTextContent('groups.tasks.form.calendarNeedsDate');
    expect(createGroupTask).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('task-repeat-afterDone'));
    fireEvent.changeText(getByTestId('task-repeat-interval'), '12');
    fireEvent.press(getByTestId('task-repeat-unit-month'));
    fireEvent.press(getByTestId('task-save'));
    await waitFor(() =>
      expect(createGroupTask).toHaveBeenCalledWith(
        'org1',
        expect.objectContaining({
          title: 'Renovar el seguro',
          assigneeUids: ['u-ana'],
          recurrence: { kind: 'afterDone', unit: 'month', interval: 12, anchorOn: null },
          slots: null,
          eventId: null,
        }),
        'admin',
      ),
    );
  });

  it('turns a task into a shift and validates the slots and time', async () => {
    const { getByTestId } = sheet({ task: task('asamblea', { assigneeUids: ['u-ana'], dueOn: '2030-03-15' }) });
    fireEvent(getByTestId('task-is-shift'), 'onValueChange', true);
    fireEvent.changeText(getByTestId('task-slots'), '0');
    fireEvent.changeText(getByTestId('task-time'), '25:00');
    fireEvent.press(getByTestId('task-save'));
    expect(updateGroupTask).not.toHaveBeenCalled();
    fireEvent.changeText(getByTestId('task-slots'), '4');
    fireEvent.changeText(getByTestId('task-time'), '9:30');
    fireEvent.press(getByTestId('task-save'));
    await waitFor(() =>
      expect(updateGroupTask).toHaveBeenCalledWith('org1', 'asamblea', expect.objectContaining({ slots: 4, time: '09:30', assigneeUids: [] })),
    );
  });

  it('deletes after confirming, only when allowed', async () => {
    const denied = sheet({ task: task('ajena'), canDelete: false });
    expect(denied.queryByTestId('task-delete')).toBeNull();
    denied.unmount();

    const { getByTestId } = sheet({ task: task('propia'), canDelete: true });
    fireEvent.press(getByTestId('task-delete'));
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    await waitFor(() => expect(deleteGroupTask).toHaveBeenCalledWith('org1', 'propia'));
  });
});
