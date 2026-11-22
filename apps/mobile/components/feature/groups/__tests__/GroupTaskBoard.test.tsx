import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { buildGroupTaskData, buildOrganizationData, type GroupTaskData } from '@cultuvilla/shared/models/organization';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import {
  applyTaskTemplate,
  createGroupTask,
  deleteTaskTemplate,
  saveTaskTemplate,
  setGroupTaskDone,
} from '@cultuvilla/shared/services/groupTaskService';
import { resetWatchers, setWatched } from '../../../../test/watchers';
import { GroupTaskBoard } from '../GroupTaskBoard';
import type { MyGroup } from '../../../../lib/orgs/useMyGroups';

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
      { uid: 'admin', name: 'Admin', role: 'admin' },
    ],
    nameOf: (uid: string) => uid,
  }),
}));

const YEAR = Number(madridDayKey(new Date()).slice(0, 4));
const NEXT = String(YEAR + 1);
const EVENT_START = new Date(`${NEXT}-08-14T18:00:00Z`);
const LATER_START = new Date(`${NEXT}-09-20T18:00:00Z`);

function task(id: string, over: Partial<GroupTaskData> = {}) {
  return { id, ...buildGroupTaskData({ title: id, createdBy: 'admin', createdAt: new Date() }), ...over };
}

const TEMPLATE = {
  id: 'tpl', name: 'Fiestas', updatedBy: 'admin', updatedAt: new Date(),
  items: [{ title: 'Orquesta', notes: null, offsetDays: -60, time: null, slots: null }],
};

const org = { id: 'org1', ...buildOrganizationData({ name: 'Peña', type: 'asociación', municipalityId: 'm1', villageSlug: 'v', requestedBy: 'x' }) };
const asAdmin = { org, role: 'admin' } as MyGroup;
const asMember = { org, role: 'member' } as MyGroup;

const lines = (screen: ReturnType<typeof render>, key: string) =>
  within(screen.getByTestId(`task-group-${key}`))
    .queryAllByTestId(/^task-row-[a-z]+$/)
    .map((el) => (el.props.testID as string).replace('task-row-', ''));

beforeEach(async () => {
  resetWatchers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setWatched('open', [
    task('asamblea', { assigneeUids: ['u-ana'], dueOn: `${NEXT}-03-15` }),
    task('escenario', { eventId: 'ev1', dueOn: `${NEXT}-08-10`, slots: 4, claimedUids: ['admin'] }),
    task('orquesta', { eventId: 'ev1', dueOn: `${NEXT}-06-01` }),
  ]);
  setWatched('done', [
    task('extintores', { assigneeUids: ['u-luis'], doneAt: new Date(), doneBy: 'u-luis' }),
    task('carteles', { eventId: 'ev1', assigneeUids: ['u-luis', 'admin'], doneAt: new Date(), doneBy: 'u-luis' }),
  ]);
  setWatched('templates', [TEMPLATE]);
  setWatched('events', [
    { id: 'ev2', title: 'Cena de socios', startDate: LATER_START },
    { id: 'ev1', title: 'Fiestas de agosto', startDate: EVENT_START },
  ]);
});

describe('GroupTaskBoard — the list', () => {
  it('lists pending tasks on lines under their event, by date, with "Otras tareas" last', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(screen.getByTestId('group-task-board')).toBeTruthy();
    const order = screen.getAllByTestId(/^task-group-(?!toggle)/).map((el) => el.props.testID as string);
    expect(order).toEqual(['task-group-ev1', 'task-group-ev2', 'task-group-other']);
    expect(lines(screen, 'ev1')).toEqual(['orquesta', 'escenario']);
    expect(screen.getByTestId('task-row-people-escenario')).toBeTruthy();
    expect(screen.getByTestId('task-group-toggle-ev1')).toHaveTextContent(/groups.tasks.checklists.progress:1\|3/);
  });

  it('opens only the first group, and folds any open or closed', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(lines(screen, 'other')).toEqual([]);
    expect(screen.getByTestId('task-group-ev2')).toHaveTextContent(/groups.tasks.checklists.empty/);
    fireEvent.press(screen.getByTestId('task-group-toggle-other'));
    expect(lines(screen, 'other')).toEqual(['asamblea']);
    fireEvent.press(screen.getByTestId('task-group-toggle-ev1'));
    expect(lines(screen, 'ev1')).toEqual([]);
  });

  it('ticks a task done from its line, and opens it on its own screen', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    fireEvent(screen.getByTestId('task-tick-orquesta'), 'valueChange', true);
    expect(setGroupTaskDone).toHaveBeenCalledWith('org1', 'orquesta', true, 'u-ana');
    fireEvent.press(screen.getByTestId('task-edit-orquesta'));
    expect(router.push).toHaveBeenCalledWith('/grupos/org1/tarea/orquesta');
  });

  it('combines filters, swaps to the done ones, and remembers them', async () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="admin" />);
    fireEvent.press(screen.getByTestId('group-tasks-filter-mine'));
    expect(screen.queryByTestId('task-group-ev2')).toBeNull();
    expect(lines(screen, 'ev1')).toEqual(['escenario']);
    fireEvent.press(screen.getByTestId('group-tasks-filter-done'));
    expect(lines(screen, 'ev1')).toEqual(['carteles']);
    expect(screen.queryByTestId('task-group-other')).toBeNull();
    fireEvent.press(screen.getByTestId('group-tasks-filter-unassigned'));
    expect(screen.getByTestId('group-tasks-empty')).toHaveTextContent('groups.tasks.noMatches');
    await waitFor(async () => expect(await AsyncStorage.getItem('cultuvilla.taskFilters.org1')).toBe('["mine","done","unassigned"]'));

    screen.unmount();
    const again = render(<GroupTaskBoard group={asMember} uid="admin" />);
    await waitFor(() => expect(again.getByTestId('group-tasks-empty')).toBeTruthy());
  });

  it('opens every group a filter leaves', () => {
    setWatched('open', [task('sillas', { eventId: 'ev1' }), task('luces')]);
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(lines(screen, 'other')).toEqual([]);
    fireEvent.press(screen.getByTestId('group-tasks-filter-unassigned'));
    expect(lines(screen, 'ev1')).toEqual(['sillas']);
    expect(lines(screen, 'other')).toEqual(['luces']);
  });

  it('reopens a group closed by hand when a filter changes, so its matches show', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="admin" />);
    fireEvent.press(screen.getByTestId('task-group-toggle-ev1'));
    expect(lines(screen, 'ev1')).toEqual([]);
    fireEvent.press(screen.getByTestId('group-tasks-filter-mine'));
    expect(lines(screen, 'ev1')).toEqual(['escenario']);
  });

  it('keeps one line of the most used filters, and the rest behind its button', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(screen.getByTestId('group-tasks-filter-mine')).toBeTruthy();
    expect(screen.queryByTestId('group-tasks-filter-shiftOpen')).toBeNull();
    fireEvent.press(screen.getByTestId('group-tasks-filter-all'));
    expect(screen.getByTestId('task-filter-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('task-filter-option-shiftOpen'));
    expect(lines(screen, 'ev1')).toEqual(['escenario']);
    expect(screen.queryByTestId('task-group-other')).toBeNull();
    // On, it shows on the line too, where it can be turned off.
    expect(screen.getByTestId('group-tasks-filter-shiftOpen')).toBeTruthy();
    fireEvent.press(screen.getByTestId('task-filter-clear'));
    expect(screen.queryByTestId('group-tasks-filter-shiftOpen')).toBeNull();
  });

  it('shows a late task by its date alone, without calling it late', () => {
    setWatched('open', [task('pasada', { eventId: 'ev1', dueOn: '2020-01-10' })]);
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(screen.getByTestId('task-row-pasada')).not.toHaveTextContent(/groups.tasks.overdue/);
  });

  it('closes the screen with the leaderboard, under every task', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="admin" />);
    const order = screen.getAllByTestId(/^(task-group-(?!toggle)|task-leaderboard$)/).map((el) => el.props.testID as string);
    expect(order[order.length - 1]).toBe('task-leaderboard');
  });

  it('adds a task straight onto an event, or a loose one from the button', async () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(screen.queryByTestId('group-tasks')).toBeNull();
    fireEvent.press(screen.getByTestId('checklist-add-ev1'));
    fireEvent.changeText(screen.getByTestId('task-title'), 'Pedir las sillas');
    fireEvent.press(screen.getByTestId('task-next'));
    fireEvent.press(screen.getByTestId('task-next'));
    fireEvent.press(screen.getByTestId('task-save'));
    await waitFor(() =>
      expect(createGroupTask).toHaveBeenCalledWith('org1', expect.objectContaining({ title: 'Pedir las sillas', eventId: 'ev1' }), 'u-ana'),
    );
    fireEvent.press(screen.getByTestId('group-tasks-create'));
    expect(screen.getByTestId('task-sheet')).toBeTruthy();
  });
});

describe('GroupTaskBoard — the leaderboard', () => {
  it('shows everyone who has helped this year right on the screen, the viewer highlighted, nobody at zero', () => {
    const screen = render(<GroupTaskBoard group={asMember} uid="admin" />);
    expect(screen.getByTestId('task-leaderboard-row-u-luis')).toHaveTextContent(/u-luis/);
    expect(screen.getByTestId('task-leaderboard-row-admin')).toHaveTextContent(/groups.tasks.leaderboard.you/);
    expect(screen.queryByTestId('task-leaderboard-row-u-ana')).toBeNull();
    expect(screen.getByTestId('task-leaderboard-nudge')).toHaveTextContent(/nudgeBehind:2\|u-luis/);
  });

  it("counts one event's tasks on their own, and leads to the tasks nobody has taken", () => {
    setWatched('open', [task('sillas', { eventId: 'ev1' })]);
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    fireEvent.press(screen.getByTestId('task-leaderboard-period-ev1'));
    expect(screen.getByTestId('task-leaderboard-row-admin')).toBeTruthy();
    expect(screen.getByTestId('task-leaderboard-nudge')).toHaveTextContent(/nudgeNone/);
    fireEvent.press(screen.getByTestId('task-leaderboard-unassigned'));
    expect(lines(screen, 'ev1')).toEqual(['sillas']);
  });

  it('says so when nobody is credited in a period', () => {
    setWatched('done', [
      task('extintores', { assigneeUids: ['u-luis'], doneAt: new Date(), doneBy: 'u-luis' }),
      task('anon', { eventId: 'ev2', doneAt: new Date(), doneBy: null }),
    ]);
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(screen.getByTestId('task-leaderboard-periods')).toBeTruthy();
    fireEvent.press(screen.getByTestId('task-leaderboard-period-ev2'));
    expect(screen.getByTestId('task-leaderboard-empty')).toBeTruthy();
  });

  it('hides the card until someone has done a task', () => {
    setWatched('done', []);
    const screen = render(<GroupTaskBoard group={asMember} uid="u-ana" />);
    expect(screen.queryByTestId('task-leaderboard')).toBeNull();
  });
});

describe('GroupTaskBoard — an admin', () => {
  const yearly = { kind: 'calendar' as const, unit: 'year' as const, interval: 1, anchorOn: `${NEXT}-03-15` };

  it('offers a yearly asamblea with its agenda to a roster group that tracks none', async () => {
    const screen = render(<GroupTaskBoard group={asAdmin} uid="admin" />);
    fireEvent.press(screen.getByTestId('asamblea-create'));
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

  it('stays quiet once an asamblea recurs', () => {
    setWatched('open', [task('Asamblea general', { dueOn: yearly.anchorOn, recurrence: yearly })]);
    const screen = render(<GroupTaskBoard group={asAdmin} uid="admin" />);
    expect(screen.queryByTestId('asamblea-suggestion')).toBeNull();
  });

  it("applies a template from the Plantillas section to an event, dated from the event's start", async () => {
    const screen = render(<GroupTaskBoard group={asAdmin} uid="admin" />);
    expect(screen.queryByTestId('checklist-apply-ev1')).toBeNull();
    expect(screen.queryByTestId('checklist-save-ev1')).toBeNull();
    expect(screen.getByTestId('templates-section')).toBeTruthy();
    fireEvent.press(screen.getByTestId('template-apply-tpl'));
    fireEvent.press(screen.getByTestId('apply-template-event-ev1'));
    fireEvent.press(screen.getByTestId('apply-template-save'));
    await waitFor(() =>
      expect(applyTaskTemplate).toHaveBeenCalledWith('org1', expect.objectContaining({ id: 'tpl' }), madridDayKey(EVENT_START), 'ev1', 'admin'),
    );
  });

  it('applies a template to a bare date', async () => {
    const screen = render(<GroupTaskBoard group={asAdmin} uid="admin" />);
    fireEvent.press(screen.getByTestId('template-apply-tpl'));
    expect(screen.getByTestId('apply-template-sheet')).toBeTruthy();
    expect(screen.getByTestId('apply-template-target')).toBeTruthy();
    expect(screen.getByTestId('apply-template-event-ev1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('apply-template-target-date'));
    fireEvent.press(screen.getByTestId('apply-template-save'));
    await waitFor(() => expect(applyTaskTemplate).toHaveBeenCalledWith('org1', TEMPLATE, madridDayKey(new Date()), null, 'admin'));
    expect(Alert.alert).toHaveBeenCalledWith('groups.tasks.templates.applied:2');
  });

  it('writes a new template, and deletes one', async () => {
    const { getByTestId, queryByTestId } = render(<GroupTaskBoard group={asAdmin} uid="admin" />);
    fireEvent.press(getByTestId('templates-new'));
    expect(getByTestId('template-sheet')).toBeTruthy();
    expect(getByTestId('template-items-empty')).toBeTruthy();

    // Each task is written on its own, in a sheet over the template.
    fireEvent.press(getByTestId('template-add-item'));
    expect(getByTestId('template-item-sheet')).toBeTruthy();
    expect(getByTestId('template-item-when')).toBeTruthy();
    expect(queryByTestId('template-item-days')).toBeNull();
    fireEvent.changeText(getByTestId('template-item-title'), 'Montar el escenario');
    fireEvent.press(getByTestId('template-item-when-before'));
    fireEvent.changeText(getByTestId('template-item-days'), '1');
    fireEvent.changeText(getByTestId('template-item-slots'), '4');
    fireEvent.press(getByTestId('template-item-done'));
    expect(queryByTestId('template-item-sheet')).toBeNull();
    expect(getByTestId('template-item-when-0')).toHaveTextContent(
      'groups.tasks.templates.offsetBefore:1 · groups.tasks.templates.slotsCount:4',
    );

    fireEvent.press(getByTestId('template-add-item'));
    fireEvent.press(getByTestId('template-item-done'));
    expect(getByTestId('template-item-error')).toHaveTextContent('groups.tasks.templates.itemTitleRequired');
    fireEvent.changeText(getByTestId('template-item-title'), 'Recoger');
    fireEvent.press(getByTestId('template-item-done'));
    fireEvent.press(getByTestId('template-item-1'));
    expect(getByTestId('template-item-title').props.value).toBe('Recoger');
    fireEvent.press(getByTestId('template-item-remove'));
    expect(queryByTestId('template-item-1')).toBeNull();

    fireEvent.press(getByTestId('template-item-0'));
    expect(getByTestId('template-item-days').props.value).toBe('1');
    fireEvent.press(getByTestId('template-item-done'));

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
    await act(async () => {
      buttons.at(-1)?.onPress?.();
    });
    await waitFor(() => expect(deleteTaskTemplate).toHaveBeenCalledWith('org1', 'tpl'));
  });
});
