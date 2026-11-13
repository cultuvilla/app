import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { buildGroupTaskData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import {
  applyTaskTemplate,
  createGroupTask,
  deleteTaskTemplate,
  saveTaskTemplate,
} from '@cultuvilla/shared/services/groupTaskService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupTasks } from '../GroupTasks';

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
jest.mock('@cultuvilla/shared/services/groupTaskService', () => {
  const { mockWatcher } = jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers');
  return {
    watchOpenGroupTasks: mockWatcher('open'),
    watchGroupTasksDoneSince: mockWatcher('done'),
    watchEventGroupTasks: mockWatcher('eventTasks'),
    watchTaskTemplates: mockWatcher('templates'),
    watchTaskComments: mockWatcher('comments'),
    setGroupTaskDone: jest.fn().mockResolvedValue(undefined),
    createGroupTask: jest.fn().mockResolvedValue('new'),
    updateGroupTask: jest.fn().mockResolvedValue(undefined),
    deleteGroupTask: jest.fn().mockResolvedValue(undefined),
    saveTaskTemplate: jest.fn().mockResolvedValue('tpl'),
    deleteTaskTemplate: jest.fn().mockResolvedValue(undefined),
    applyTaskTemplate: jest.fn().mockResolvedValue(['a', 'b']),
  };
});
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  watchEventsByOrganization: jest.requireActual<typeof import('../../../../test/watchers')>('../../../../test/watchers').mockWatcher('events'),
}));
jest.mock('../../../../lib/orgs/useOrgMembers', () => ({
  useMemberFaces: () => ({}),
  useOrgMembers: () => ({
    members: [
      { uid: 'u-ana', name: 'Ana', role: 'member' },
      { uid: 'u-luis', name: 'Luis', role: 'member' },
    ],
    nameOf: (uid: string) => uid,
  }),
}));

const YEAR = Number(madridDayKey(new Date()).slice(0, 4));
const EVENT_START = new Date(`${String(YEAR + 1)}-08-14T18:00:00Z`);

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const TEMPLATE = {
  id: 'tpl', name: 'Fiestas', updatedBy: 'admin', updatedAt: new Date(),
  items: [{ title: 'Orquesta', notes: null, offsetDays: -60, time: null, slots: null }],
};

beforeEach(() => {
  resetWatchers();
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('open', [task('asamblea', { assigneeUids: ['u-ana'], dueOn: `${String(YEAR + 1)}-03-15` })]);
  setWatched('done', [task('extintores', { assigneeUids: ['u-luis'], doneAt: new Date(), doneBy: 'u-luis' })]);
  setWatched('templates', [TEMPLATE]);
  setWatched('events', [{ id: 'ev1', title: 'Fiestas de agosto', startDate: EVENT_START }]);
  setWatched('eventTasks', [task('escenario', { eventId: 'ev1', dueOn: `${String(YEAR + 1)}-08-10` })]);
});

describe('GroupTasks — asamblea anual', () => {
  const yearly = { kind: 'calendar' as const, unit: 'year' as const, interval: 1, anchorOn: `${String(YEAR + 1)}-03-15` };

  it('offers a yearly asamblea with its agenda to a roster group that tracks none', async () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea />);
    fireEvent.press(getByTestId('asamblea-create'));
    await waitFor(() =>
      expect(createGroupTask).toHaveBeenCalledWith(
        'org1',
        expect.objectContaining({
          title: 'groups.tasks.asamblea.title',
          notes: 'groups.tasks.asamblea.agenda',
          recurrence: expect.objectContaining({ kind: 'calendar', unit: 'year', interval: 1 }),
        }),
        'admin',
      ),
    );
  });

  it('stays quiet once an asamblea recurs, and for a group without a roster', () => {
    setWatched('open', [task('Asamblea general', { dueOn: yearly.anchorOn, recurrence: yearly })]);
    const tracked = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea />);
    expect(tracked.queryByTestId('asamblea-suggestion')).toBeNull();
    tracked.unmount();

    setWatched('open', []);
    const ayto = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    expect(ayto.queryByTestId('asamblea-suggestion')).toBeNull();
  });
});

describe('GroupTasks', () => {
  it('counts the fair share', () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    expect(getByTestId('fair-share-u-luis')).toHaveTextContent('Luisgroups.tasks.fairShare.count:1');
    expect(getByTestId('fair-share-u-ana')).toHaveTextContent('Anagroups.tasks.fairShare.count:0');
  });

  it("applies a template to an event from its checklist, dated from the event's start", async () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    fireEvent.press(getByTestId('checklist-toggle-ev1'));
    expect(getByTestId('task-row-escenario')).toBeTruthy();
    fireEvent.press(getByTestId('checklist-apply-ev1'));
    fireEvent.press(getByTestId('apply-template-pick-tpl'));
    fireEvent.press(getByTestId('apply-template-save'));
    await waitFor(() =>
      expect(applyTaskTemplate).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'tpl' }), madridDayKey(EVENT_START), 'ev1', 'admin'),
    );
  });

  it("saves an event's checklist as a template, as offsets from its start", async () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    fireEvent.press(getByTestId('checklist-toggle-ev1'));
    fireEvent.press(getByTestId('checklist-save-ev1'));
    expect(getByTestId('template-item-offset-0').props.value).toBe('-4');
    fireEvent.press(getByTestId('template-save'));
    await waitFor(() =>
      expect(saveTaskTemplate).toHaveBeenCalledWith(
        'org1',
        null,
        { name: 'Fiestas de agosto', items: [expect.objectContaining({ title: 'escenario', offsetDays: -4 })] },
        'admin',
      ),
    );
  });

  it('applies a template to a bare date', async () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    fireEvent.press(getByTestId('template-apply-tpl'));
    fireEvent.press(getByTestId('apply-template-target-date'));
    fireEvent.press(getByTestId('apply-template-save'));
    await waitFor(() => expect(applyTaskTemplate).toHaveBeenCalledWith('org1', TEMPLATE, madridDayKey(new Date()), null, 'admin'));
    expect(Alert.alert).toHaveBeenCalledWith('groups.tasks.templates.applied:2');
  });

  it('adds a task straight onto an event, and opens one on its own screen', async () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    expect(getByTestId('group-tasks')).toBeTruthy();
    expect(getByTestId('fair-share')).toBeTruthy();
    fireEvent.press(getByTestId('checklist-toggle-ev1'));
    fireEvent.press(getByTestId('checklist-add-ev1'));
    expect(getByTestId('task-sheet')).toBeTruthy();
    for (const id of ['task-notes', 'task-due', 'task-assignees', 'task-repeat']) expect(getByTestId(id)).toBeTruthy();
    fireEvent.changeText(getByTestId('task-title'), 'Pedir las sillas');
    fireEvent.press(getByTestId('task-save'));
    await waitFor(() => expect(createGroupTask).toHaveBeenCalledWith('org1', expect.objectContaining({ title: 'Pedir las sillas', eventId: 'ev1' }), 'admin'));

    fireEvent.press(getByTestId('task-edit-escenario'));
    expect(router.push).toHaveBeenCalledWith('/grupos/org1/tarea/escenario');
  });

  it('writes a new template, and deletes one', async () => {
    const { getByTestId, queryByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    fireEvent.press(getByTestId('templates-new'));
    expect(getByTestId('template-sheet')).toBeTruthy();
    fireEvent.changeText(getByTestId('template-item-title-0'), 'Montar el escenario');
    fireEvent.changeText(getByTestId('template-item-offset-0'), '-1');
    fireEvent.changeText(getByTestId('template-item-slots-0'), '4');
    fireEvent.press(getByTestId('template-add-item'));
    fireEvent.press(getByTestId('template-item-remove-1'));
    expect(queryByTestId('template-item-title-1')).toBeNull();
    fireEvent.press(getByTestId('template-save'));
    expect(getByTestId('template-error')).toHaveTextContent('groups.tasks.templates.nameRequired');
    fireEvent.changeText(getByTestId('template-name'), 'Fiestas');
    fireEvent.press(getByTestId('template-save'));
    await waitFor(() =>
      expect(saveTaskTemplate).toHaveBeenCalledWith(
        'org1',
        null,
        { name: 'Fiestas', items: [{ title: 'Montar el escenario', notes: null, offsetDays: -1, time: null, slots: 4 }] },
        'admin',
      ),
    );

    fireEvent.press(getByTestId('template-open-tpl'));
    fireEvent.press(getByTestId('template-delete'));
    const buttons = (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []) as { onPress?: () => void }[];
    buttons.at(-1)?.onPress?.();
    await waitFor(() => expect(deleteTaskTemplate).toHaveBeenCalledWith('org1', 'tpl'));
  });

  it('the apply sheet offers an event or a date', () => {
    const { getByTestId } = render(<GroupTasks orgId="org1" uid="admin" isAdmin includePrivateEvents={false} suggestAsamblea={false} />);
    fireEvent.press(getByTestId('template-apply-tpl'));
    expect(getByTestId('apply-template-sheet')).toBeTruthy();
    expect(getByTestId('apply-template-target')).toBeTruthy();
    expect(getByTestId('apply-template-event-ev1')).toBeTruthy();
  });
});

describe('GroupTasks — a member', () => {
  const asMember = () => render(<GroupTasks orgId="org1" uid="u-ana" isAdmin={false} includePrivateEvents={false} suggestAsamblea />);

  it('keeps no templates, fair share or asamblea suggestion', () => {
    const { getByTestId, queryByTestId } = asMember();
    expect(getByTestId('group-tasks')).toBeTruthy();
    expect(queryByTestId('templates-new')).toBeNull();
    expect(queryByTestId('template-tpl')).toBeNull();
    expect(queryByTestId('fair-share')).toBeNull();
    expect(queryByTestId('asamblea-suggestion')).toBeNull();
    fireEvent.press(getByTestId('checklist-toggle-ev1'));
    expect(queryByTestId('checklist-apply-ev1')).toBeNull();
    expect(queryByTestId('checklist-save-ev1')).toBeNull();
  });

});
