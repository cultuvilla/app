import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { eventTaskProgress, hasSocioRoster, templateItemsFromTasks, type TaskTemplateItem } from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import {
  setGroupTaskDone,
  watchGroupTasksDoneSince,
  watchOpenGroupTasks,
  watchTaskTemplates,
  type GroupTask,
  type TaskTemplate,
} from '@cultuvilla/shared/services/groupTaskService';
import { Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { Fab } from '../../primitives/Fab';
import { ApplyTemplateSheet, type ChecklistEvent } from './ApplyTemplateSheet';
import { GroupTasks } from './GroupTasks';
import { TaskGroupFold, TaskLine } from './TaskGroups';
import { LeaderboardSheet, LeaderboardStrip } from './TaskLeaderboard';
import { TaskSheet } from './TaskSheet';
import { TemplateSheet } from './TemplateSheet';
import { showAlert } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { groupTaskHref } from '../../../lib/navigation/routes';
import {
  TASK_FILTERS,
  filterTasks,
  groupTasksByEvent,
  taskLeaderboard,
  taskPeople,
  type TaskFilter,
} from '../../../lib/orgs/taskBoard';
import { readTaskFilters, rememberTaskFilters } from '../../../lib/orgs/taskFilterStore';
import { useMemberFaces, useOrgMembers } from '../../../lib/orgs/useOrgMembers';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';

type Sheet =
  | { kind: 'task'; eventId: string | null }
  | { kind: 'template'; template: TaskTemplate | null; initial: { name: string; items: TaskTemplateItem[] } | null }
  | { kind: 'apply'; template: TaskTemplate | null; event: ChecklistEvent | null }
  | { kind: 'leaderboard' }
  | null;

/** Midnight on 1 January in Madrid, which is always on CET (+01:00). */
function startOfYear(year: string): Date {
  return new Date(`${year}-01-01T00:00:00+01:00`);
}

/**
 * The group's Tareas: who has helped most (a strip that opens the
 * leaderboard), filters that combine, and every task on one line under its
 * event, each event folding open or closed. Any member ticks a task done,
 * opens it, or adds one; admins also keep the templates.
 */
export function GroupTaskBoard({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { org, role } = group;
  const isAdmin = role === 'admin';
  const today = madridDayKey(new Date());
  const year = today.slice(0, 4);
  const { members, nameOf } = useOrgMembers(org.id);
  const open = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', org.id, (next, error) => watchOpenGroupTasks(org.id, next, error));
  const done = useWatch<GroupTask[]>('groups:watchGroupTasksDoneSince', `${org.id}|${year}`, (next, error) =>
    watchGroupTasksDoneSince(org.id, startOfYear(year), next, error),
  );
  const events = useWatch<(EventData & { id: string })[]>('groups:watchEventsByOrganization', org.id, (next, error) =>
    watchEventsByOrganization(org.id, { includePrivate: true }, next, error),
  );
  // Templates are admin-only in the rules: a member's read would be refused.
  const templates = useWatch<TaskTemplate[]>(
    'groups:watchTaskTemplates',
    isAdmin ? org.id : null,
    isAdmin ? (next, error) => watchTaskTemplates(org.id, next, error) : null,
  );

  const [filters, setFilters] = useState<ReadonlySet<TaskFilter>>(new Set());
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    let live = true;
    void readTaskFilters(org.id).then((saved) => {
      if (live && saved.length > 0) setFilters(new Set(saved));
    });
    return () => {
      live = false;
    };
  }, [org.id]);
  const changeFilters = (next: Set<TaskFilter>) => {
    setFilters(next);
    void rememberTaskFilters(org.id, [...next]);
  };
  const toggleFilter = (f: TaskFilter) => {
    const next = new Set(filters);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    changeFilters(next);
  };

  const openTasks = open.data ?? [];
  const doneTasks = done.data ?? [];
  const eventList = useMemo(
    () => (events.data ?? []).map((e) => ({ id: e.id, title: e.title, startDate: e.startDate })),
    [events.data],
  );
  const upcoming = useMemo(
    () => eventList.filter((e) => madridDayKey(e.startDate) >= today).sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
    [eventList, today],
  );
  const showingDone = filters.has('done');
  const groups = useMemo(
    () =>
      groupTasksByEvent(filterTasks(openTasks, doneTasks, filters, uid, today), eventList, {
        done: showingDone,
        emptyEvents: filters.size === 0 ? upcoming : [],
      }),
    [openTasks, doneTasks, filters, uid, today, eventList, showingDone, upcoming],
  );
  const progress = useMemo(() => eventTaskProgress([...openTasks, ...doneTasks]), [openTasks, doneTasks]);
  const memberUids = useMemo(() => members.map((m) => m.uid), [members]);
  const board = useMemo(() => taskLeaderboard(doneTasks, memberUids, { kind: 'year' }), [doneTasks, memberUids]);
  const unassignedCount = useMemo(() => openTasks.filter((task) => taskPeople(task).length === 0).length, [openTasks]);
  const faces = useMemberFaces([...groups.flatMap((g) => g.tasks.flatMap(taskPeople)), ...board.map((r) => r.uid)]);
  const templateList = useMemo(() => [...(templates.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')), [templates.data]);
  const status = showingDone ? done.status : open.status;

  // Unfiltered, only the first group starts open; a filter's few matches all show.
  const isOpen = (key: string, index: number) => folds[key] ?? (index === 0 || filters.size > 0);
  const tick = (task: GroupTask, next: boolean) => {
    setGroupTaskDone(org.id, task.id, next, uid).catch(() => showAlert(t('groups.tasks.error')));
  };
  const close = () => setSheet(null);

  return (
    <View className="flex-1">
      <ScrollView testID="group-task-board" contentContainerClassName="px-4 pt-3 pb-24 gap-3" keyboardShouldPersistTaps="handled">
        <LeaderboardStrip rows={board} uid={uid} faces={faces} nameOf={nameOf} onOpen={() => setSheet({ kind: 'leaderboard' })} />

        <HStack gap={2} className="flex-wrap" testID="group-tasks-filter">
          {TASK_FILTERS.map((f) => {
            const on = filters.has(f);
            return (
              <Pressable
                key={f}
                testID={`group-tasks-filter-${f}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => toggleFilter(f)}
                className={`px-3 py-1.5 rounded-full border ${on ? 'bg-secondary border-secondary' : 'bg-surface-elevated border-subtle'}`}
              >
                <Text variant="bodySm" tone={on ? 'onSecondary' : 'primary'} className="font-semibold">
                  {t(`groups.tasks.filter.${f}`)}
                </Text>
              </Pressable>
            );
          })}
        </HStack>

        {groups.length === 0 && status !== 'loading' ? (
          <Text tone="muted" className="py-6 text-center" testID="group-tasks-empty">
            {t(filters.size === 0 ? 'groups.tasks.noOpen' : showingDone && filters.size === 1 ? 'groups.tasks.noDone' : 'groups.tasks.noMatches')}
          </Text>
        ) : null}

        {groups.map((g, index) => {
          const event = g.event;
          return (
            <TaskGroupFold
              key={g.key}
              group={g}
              progress={event ? (progress.get(event.id) ?? null) : null}
              expanded={isOpen(g.key, index)}
              onToggle={() => setFolds((prev) => ({ ...prev, [g.key]: !isOpen(g.key, index) }))}
            >
              {g.tasks.length === 0 ? (
                <Text variant="bodySm" tone="muted" className="px-3 py-2 border-t border-subtle">
                  {t('groups.tasks.checklists.noTasks')}
                </Text>
              ) : (
                g.tasks.map((task) => (
                  <TaskLine
                    key={task.id}
                    task={task}
                    today={today}
                    faces={faces}
                    onTick={(next) => tick(task, next)}
                    onOpen={() => router.push(groupTaskHref(org.id, task.id))}
                  />
                ))
              )}
              {event && !showingDone ? (
                <HStack gap={2} className="flex-wrap px-3 py-2 border-t border-subtle">
                  <Button size="md" variant="ghost" onPress={() => setSheet({ kind: 'task', eventId: event.id })} testID={`checklist-add-${event.id}`}>
                    {t('groups.tasks.checklists.addTask')}
                  </Button>
                  {isAdmin ? (
                    <Button size="md" variant="ghost" onPress={() => setSheet({ kind: 'apply', template: null, event })} testID={`checklist-apply-${event.id}`}>
                      {t('groups.tasks.checklists.applyTemplate')}
                    </Button>
                  ) : null}
                  {isAdmin && g.tasks.length > 0 ? (
                    <Button
                      size="md"
                      variant="ghost"
                      onPress={() => {
                        const all = [...openTasks, ...doneTasks].filter((task) => task.eventId === event.id);
                        setSheet({
                          kind: 'template',
                          template: null,
                          initial: { name: event.title, items: templateItemsFromTasks(all, madridDayKey(event.startDate)) },
                        });
                      }}
                      testID={`checklist-save-${event.id}`}
                    >
                      {t('groups.tasks.checklists.saveAsTemplate')}
                    </Button>
                  ) : null}
                </HStack>
              ) : null}
            </TaskGroupFold>
          );
        })}

        {isAdmin ? (
          <VStack className="pt-4">
            <GroupTasks
              orgId={org.id}
              uid={uid}
              today={today}
              tasks={[...openTasks, ...doneTasks]}
              tasksReady={open.status === 'ready' && done.status === 'ready'}
              templates={templateList}
              suggestAsamblea={hasSocioRoster(org.type)}
              onOpenTemplate={(template) => setSheet({ kind: 'template', template, initial: null })}
              onApplyTemplate={(template) => setSheet({ kind: 'apply', template, event: null })}
            />
          </VStack>
        ) : null}
      </ScrollView>

      <Fab testID="group-tasks-create" label={t('groups.tasks.new')} onPress={() => setSheet({ kind: 'task', eventId: null })} />
      <TaskSheet
        visible={sheet?.kind === 'task'}
        orgId={org.id}
        uid={uid}
        task={null}
        eventId={sheet?.kind === 'task' ? sheet.eventId : null}
        members={members}
        onClose={close}
      />
      <TemplateSheet
        visible={sheet?.kind === 'template'}
        orgId={org.id}
        uid={uid}
        template={sheet?.kind === 'template' ? sheet.template : null}
        initial={sheet?.kind === 'template' ? sheet.initial : null}
        onClose={close}
      />
      <ApplyTemplateSheet
        visible={sheet?.kind === 'apply'}
        orgId={org.id}
        uid={uid}
        template={sheet?.kind === 'apply' ? sheet.template : null}
        event={sheet?.kind === 'apply' ? sheet.event : null}
        templates={templateList}
        events={upcoming}
        onClose={close}
      />
      <LeaderboardSheet
        visible={sheet?.kind === 'leaderboard'}
        onClose={close}
        doneTasks={doneTasks}
        memberUids={memberUids}
        events={eventList}
        uid={uid}
        faces={faces}
        nameOf={nameOf}
        unassignedCount={unassignedCount}
        onShowUnassigned={() => {
          close();
          changeFilters(new Set<TaskFilter>(['unassigned']));
        }}
      />
    </View>
  );
}
