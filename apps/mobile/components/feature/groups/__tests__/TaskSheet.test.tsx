import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { createGroupTask, updateGroupTask } from '@cultuvilla/shared/services/groupTaskService';
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

beforeEach(() => jest.clearAllMocks());

describe('TaskSheet', () => {
  it('asks in three steps: what, when, who', () => {
    const { getByTestId, queryByTestId } = sheet();
    expect(getByTestId('task-sheet')).toBeTruthy();
    expect(getByTestId('task-notes')).toBeTruthy();
    expect(queryByTestId('task-due')).toBeNull();
    // Nothing to do yet: the step does not move on.
    fireEvent.press(getByTestId('task-next'));
    expect(queryByTestId('task-due')).toBeNull();

    fireEvent.changeText(getByTestId('task-title'), 'Pedir las sillas');
    fireEvent.press(getByTestId('task-next'));
    expect(getByTestId('task-due')).toBeTruthy();
    expect(getByTestId('task-repeat')).toBeTruthy();
    fireEvent.press(getByTestId('task-repeat-calendar'));
    expect(getByTestId('task-repeat-unit')).toBeTruthy();
    fireEvent.press(getByTestId('task-repeat-none'));

    fireEvent.press(getByTestId('task-next'));
    expect(getByTestId('task-assignees')).toBeTruthy();
    expect(getByTestId('task-save')).toBeTruthy();
  });

  it('creates a task repeating after it is done, with who does it', async () => {
    const { getByTestId } = sheet();
    fireEvent.changeText(getByTestId('task-title'), 'Renovar el seguro');
    fireEvent.press(getByTestId('task-next'));
    // A fixed-date repeat needs a date, and the step says so.
    fireEvent.press(getByTestId('task-repeat-calendar'));
    expect(getByTestId('task-due-error')).toHaveTextContent('groups.tasks.form.calendarNeedsDate');
    fireEvent.press(getByTestId('task-next'));
    expect(getByTestId('task-due-error')).toBeTruthy();

    fireEvent.press(getByTestId('task-repeat-afterDone'));
    fireEvent.changeText(getByTestId('task-repeat-interval'), '12');
    fireEvent.press(getByTestId('task-repeat-unit-month'));
    fireEvent.press(getByTestId('task-next'));
    fireEvent.press(getByTestId('task-assignee-u-ana'));
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

  it('keeps encargados and still looks for more volunteers', async () => {
    const { getByTestId } = sheet();
    fireEvent.changeText(getByTestId('task-title'), 'Barra de las fiestas');
    fireEvent.press(getByTestId('task-next'));
    fireEvent.press(getByTestId('step-dot-0'));
    fireEvent.press(getByTestId('task-next'));
    fireEvent.press(getByTestId('task-next'));
    fireEvent.press(getByTestId('task-assignee-u-ana'));
    fireEvent(getByTestId('task-is-shift'), 'onValueChange', true);
    // Encargados stay on screen with the call for volunteers.
    expect(getByTestId('task-assignees')).toBeTruthy();
    expect(getByTestId('task-shift-due-error')).toBeTruthy();
    fireEvent.press(getByTestId('step-dot-1'));
    fireEvent(getByTestId('task-due'), 'onChange', new Date(2030, 7, 14));
    fireEvent.press(getByTestId('task-next'));
    fireEvent.changeText(getByTestId('task-slots'), '3');
    fireEvent.press(getByTestId('task-save'));
    await waitFor(() =>
      expect(createGroupTask).toHaveBeenCalledWith('org1', expect.objectContaining({ assigneeUids: ['u-ana'], slots: 3, dueOn: '2030-08-14' }), 'admin'),
    );
  });

  it('needs a date for a shift', () => {
    const { getByTestId } = sheet();
    fireEvent.changeText(getByTestId('task-title'), 'Barra');
    fireEvent.press(getByTestId('task-next'));
    fireEvent.press(getByTestId('task-next'));
    fireEvent(getByTestId('task-is-shift'), 'onValueChange', true);
    fireEvent.changeText(getByTestId('task-slots'), '3');
    expect(getByTestId('task-shift-due-error')).toHaveTextContent('groups.tasks.form.shiftNeedsDate');
    fireEvent.press(getByTestId('task-save'));
    expect(createGroupTask).not.toHaveBeenCalled();
  });

  it('edits with every step open, and saves only once every step is right', async () => {
    const { getByTestId } = sheet({ task: task('asamblea', { assigneeUids: ['u-ana'], dueOn: '2030-03-15' }) });
    expect(getByTestId('task-title').props.value).toBe('asamblea');
    fireEvent.press(getByTestId('step-dot-1'));
    fireEvent.changeText(getByTestId('task-time'), '25:00');
    expect(getByTestId('task-time')).toBeTruthy();
    fireEvent.press(getByTestId('step-dot-2'));
    fireEvent(getByTestId('task-is-shift'), 'onValueChange', true);
    fireEvent.changeText(getByTestId('task-slots'), '0');
    fireEvent.press(getByTestId('task-save'));
    fireEvent.changeText(getByTestId('task-slots'), '4');
    // The time two steps back is still wrong.
    fireEvent.press(getByTestId('task-save'));
    expect(updateGroupTask).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('step-dot-1'));
    fireEvent.changeText(getByTestId('task-time'), '9:30');
    fireEvent.press(getByTestId('step-dot-2'));
    fireEvent.press(getByTestId('task-save'));
    await waitFor(() =>
      expect(updateGroupTask).toHaveBeenCalledWith('org1', 'asamblea', expect.objectContaining({ slots: 4, time: '09:30', assigneeUids: ['u-ana'] })),
    );
  });
});
