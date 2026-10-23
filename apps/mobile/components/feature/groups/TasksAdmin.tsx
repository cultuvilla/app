import { useMemo, useState } from 'react';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import {
  asambleaTaskInput,
  compareTasksByDue,
  isAsambleaTask,
  templateItemsFromTasks,
  type TaskTemplateItem,
} from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import {
  createGroupTask,
  setGroupTaskDone,
  watchEventGroupTasks,
  watchGroupTasksDoneSince,
  watchOpenGroupTasks,
  watchTaskTemplates,
  type GroupTask,
  type TaskTemplate,
} from '@cultuvilla/shared/services/groupTaskService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { offsetLabel } from '../../../lib/orgs/tasks';
import { useOrgMembers } from '../../../lib/orgs/useOrgMembers';
import { ApplyTemplateSheet, type ChecklistEvent } from './ApplyTemplateSheet';
import { FairShare } from './FairShare';
import { TaskRow } from './TaskRows';
import { TaskSheet } from './TaskSheet';
import { TemplateSheet } from './TemplateSheet';

type Sheet =
  | { kind: 'task'; task: GroupTask | null; eventId: string | null }
  | { kind: 'template'; template: TaskTemplate | null; initial: { name: string; items: TaskTemplateItem[] } | null }
  | { kind: 'apply'; template: TaskTemplate | null; event: ChecklistEvent | null }
  | null;

/** Midnight on 1 January in Madrid, which is always on CET (+01:00). */
function startOfYear(year: string): Date {
  return new Date(`${year}-01-01T00:00:00+01:00`);
}

const RECENT_DONE = 10;

/**
 * Admins, in Gestionar: every open task (tap to edit), what was done this
 * year, each upcoming event's checklist (apply a template, save it as one),
 * the templates, and the fair-share count. A group with a socio roster that
 * tracks no asamblea yet is offered one, recurring yearly — never created for it.
 */
export function TasksAdmin({
  orgId,
  uid,
  includePrivateEvents,
  suggestAsamblea,
}: {
  orgId: string;
  uid: string;
  includePrivateEvents: boolean;
  suggestAsamblea: boolean;
}) {
  const { t } = useT();
  const { members, nameOf } = useOrgMembers(orgId);
  const year = madridDayKey(new Date()).slice(0, 4);
  const open = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', orgId, (next, error) => watchOpenGroupTasks(orgId, next, error));
  const done = useWatch<GroupTask[]>('groups:watchGroupTasksDoneSince', `${orgId}|${year}`, (next, error) =>
    watchGroupTasksDoneSince(orgId, startOfYear(year), next, error),
  );
  const templates = useWatch<TaskTemplate[]>('groups:watchTaskTemplates', orgId, (next, error) => watchTaskTemplates(orgId, next, error));
  const orgEvents = useWatch<ChecklistEvent[]>('groups:watchEventsByOrganization', `${orgId}|${String(includePrivateEvents)}`, (next, error) =>
    watchEventsByOrganization(orgId, { includePrivate: includePrivateEvents }, next, error),
  );
  const [sheet, setSheet] = useState<Sheet>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const openTasks = useMemo(() => [...(open.data ?? [])].sort(compareTasksByDue), [open.data]);
  const doneTasks = useMemo(
    () => [...(done.data ?? [])].sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0)),
    [done.data],
  );
  const today = madridDayKey(new Date());
  const upcoming = useMemo(
    () =>
      (orgEvents.data ?? [])
        .filter((e) => madridDayKey(e.startDate) >= today)
        .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
        .map((e) => ({ id: e.id, title: e.title, startDate: e.startDate })),
    [orgEvents.data, today],
  );
  const templateList = useMemo(() => [...(templates.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')), [templates.data]);

  const [creatingAsamblea, setCreatingAsamblea] = useState(false);
  const showAsamblea =
    suggestAsamblea && open.status === 'ready' && done.status === 'ready' && ![...openTasks, ...doneTasks].some(isAsambleaTask);
  const createAsamblea = () => {
    setCreatingAsamblea(true);
    createGroupTask(orgId, asambleaTaskInput(today, { title: t('groups.tasks.asamblea.title'), agenda: t('groups.tasks.asamblea.agenda') }), uid)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setCreatingAsamblea(false));
  };

  const tick = (task: GroupTask, isDone: boolean) => {
    setGroupTaskDone(orgId, task.id, isDone, uid).catch(() => showAlert(t('groups.tasks.error')));
  };
  const close = () => setSheet(null);

  return (
    <VStack gap={3} testID="tasks-admin">
      <HStack justify="between" align="center">
        <DetailSectionHeading>{t('groups.tasks.adminTitle')}</DetailSectionHeading>
        <Button size="md" variant="secondary" onPress={() => setSheet({ kind: 'task', task: null, eventId: null })} testID="tasks-new">
          {t('groups.tasks.new')}
        </Button>
      </HStack>

      {showAsamblea ? (
        <Card testID="asamblea-suggestion">
          <VStack gap={2}>
            <Text className="font-bold">{t('groups.tasks.asamblea.suggestionTitle')}</Text>
            <Text variant="bodySm" tone="muted">
              {t('groups.tasks.asamblea.suggestionBody')}
            </Text>
            <HStack>
              <Button size="md" onPress={createAsamblea} loading={creatingAsamblea} testID="asamblea-create">
                {t('groups.tasks.asamblea.create')}
              </Button>
            </HStack>
          </VStack>
        </Card>
      ) : null}

      <Text className="font-bold">{t('groups.tasks.openTitle')}</Text>
      {openTasks.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.tasks.noOpen')}
        </Text>
      ) : (
        openTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            canTick
            onTick={(d) => tick(task, d)}
            onEdit={() => setSheet({ kind: 'task', task, eventId: task.eventId })}
            nameOf={nameOf}
          />
        ))
      )}

      <Text className="font-bold pt-2">{t('groups.tasks.doneTitle')}</Text>
      {doneTasks.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.tasks.noDone')}
        </Text>
      ) : (
        doneTasks.slice(0, RECENT_DONE).map((task) => (
          <TaskRow key={task.id} task={task} canTick onTick={(d) => tick(task, d)} nameOf={nameOf} />
        ))
      )}

      <Text className="font-bold pt-2">{t('groups.tasks.checklists.title')}</Text>
      {upcoming.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.tasks.checklists.none')}
        </Text>
      ) : (
        upcoming.map((event) => (
          <EventChecklist
            key={event.id}
            orgId={orgId}
            uid={uid}
            event={event}
            expanded={openEventId === event.id}
            onToggle={() => setOpenEventId((id) => (id === event.id ? null : event.id))}
            nameOf={nameOf}
            onAddTask={() => setSheet({ kind: 'task', task: null, eventId: event.id })}
            onEditTask={(task) => setSheet({ kind: 'task', task, eventId: event.id })}
            onApplyTemplate={() => setSheet({ kind: 'apply', template: null, event })}
            onSaveAsTemplate={(tasks) =>
              setSheet({
                kind: 'template',
                template: null,
                initial: { name: event.title, items: templateItemsFromTasks(tasks, madridDayKey(event.startDate)) },
              })
            }
          />
        ))
      )}

      <HStack justify="between" align="center" className="pt-2">
        <Text className="font-bold">{t('groups.tasks.templates.title')}</Text>
        <Button size="md" variant="ghost" onPress={() => setSheet({ kind: 'template', template: null, initial: null })} testID="templates-new">
          {t('groups.tasks.templates.new')}
        </Button>
      </HStack>
      {templateList.length === 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.tasks.templates.none')}
        </Text>
      ) : (
        templateList.map((tpl) => (
          <HStack key={tpl.id} gap={3} align="center" className="py-1" testID={`template-${tpl.id}`}>
            <Pressable
              className="flex-1"
              accessibilityRole="button"
              onPress={() => setSheet({ kind: 'template', template: tpl, initial: null })}
              testID={`template-open-${tpl.id}`}
            >
              <Text className="font-bold">{tpl.name}</Text>
              <Text variant="bodySm" tone="muted">
                {[t('groups.tasks.templates.items', { count: tpl.items.length }), ...tpl.items.slice(0, 2).map((i) => `${i.title} (${offsetLabel(t, i.offsetDays)})`)].join(' · ')}
              </Text>
            </Pressable>
            <Button size="md" variant="secondary" onPress={() => setSheet({ kind: 'apply', template: tpl, event: null })} testID={`template-apply-${tpl.id}`}>
              {t('groups.tasks.templates.apply')}
            </Button>
          </HStack>
        ))
      )}

      <Card>
        <FairShare doneTasks={done.data ?? []} members={members} year={year} />
      </Card>

      <TaskSheet
        visible={sheet?.kind === 'task'}
        orgId={orgId}
        uid={uid}
        task={sheet?.kind === 'task' ? sheet.task : null}
        eventId={sheet?.kind === 'task' ? sheet.eventId : null}
        members={members}
        onClose={close}
      />
      <TemplateSheet
        visible={sheet?.kind === 'template'}
        orgId={orgId}
        uid={uid}
        template={sheet?.kind === 'template' ? sheet.template : null}
        initial={sheet?.kind === 'template' ? sheet.initial : null}
        onClose={close}
      />
      <ApplyTemplateSheet
        visible={sheet?.kind === 'apply'}
        orgId={orgId}
        uid={uid}
        template={sheet?.kind === 'apply' ? sheet.template : null}
        event={sheet?.kind === 'apply' ? sheet.event : null}
        templates={templateList}
        events={upcoming}
        onClose={close}
      />
    </VStack>
  );
}

/** One upcoming event: its checklist's progress, and when opened its tasks and the template actions. */
function EventChecklist({
  orgId,
  uid,
  event,
  expanded,
  onToggle,
  nameOf,
  onAddTask,
  onEditTask,
  onApplyTemplate,
  onSaveAsTemplate,
}: {
  orgId: string;
  uid: string;
  event: ChecklistEvent;
  expanded: boolean;
  onToggle: () => void;
  nameOf: (uid: string) => string;
  onAddTask: () => void;
  onEditTask: (task: GroupTask) => void;
  onApplyTemplate: () => void;
  onSaveAsTemplate: (tasks: GroupTask[]) => void;
}) {
  const { t } = useT();
  const tasks = useWatch<GroupTask[]>('groups:watchEventGroupTasks', `${orgId}|${event.id}`, (next, error) =>
    watchEventGroupTasks(orgId, event.id, next, error),
  );
  const rows = useMemo(() => [...(tasks.data ?? [])].sort(compareTasksByDue), [tasks.data]);
  const doneCount = rows.filter((r) => r.doneAt !== null).length;

  return (
    <Card testID={`checklist-${event.id}`}>
      <VStack gap={2}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} testID={`checklist-toggle-${event.id}`}>
          <Text className="font-bold">{event.title}</Text>
          <Text variant="bodySm" tone="muted">
            {[
              formatDate(event.startDate, 'short'),
              rows.length === 0 ? t('groups.tasks.checklists.empty') : t('groups.tasks.checklists.progress', { done: doneCount, total: rows.length }),
            ].join(' · ')}
          </Text>
        </Pressable>
        {expanded ? (
          <VStack gap={2}>
            {rows.length === 0 ? (
              <Text variant="bodySm" tone="muted">
                {t('groups.tasks.checklists.noTasks')}
              </Text>
            ) : (
              rows.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  canTick
                  onTick={(d) => {
                    setGroupTaskDone(orgId, task.id, d, uid).catch(() => showAlert(t('groups.tasks.error')));
                  }}
                  onEdit={() => onEditTask(task)}
                  nameOf={nameOf}
                />
              ))
            )}
            <HStack gap={2} className="flex-wrap">
              <Button size="md" variant="secondary" onPress={onAddTask} testID={`checklist-add-${event.id}`}>
                {t('groups.tasks.checklists.addTask')}
              </Button>
              <Button size="md" variant="secondary" onPress={onApplyTemplate} testID={`checklist-apply-${event.id}`}>
                {t('groups.tasks.checklists.applyTemplate')}
              </Button>
              {rows.length > 0 ? (
                <Button size="md" variant="ghost" onPress={() => onSaveAsTemplate(rows)} testID={`checklist-save-${event.id}`}>
                  {t('groups.tasks.checklists.saveAsTemplate')}
                </Button>
              ) : null}
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </Card>
  );
}
