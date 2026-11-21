import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iconSizes, palette } from '@cultuvilla/shared/design-system';
import { isTaskOverdue } from '@cultuvilla/shared/models/organization';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { Avatar, Checkbox, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { taskPeople, type TaskGroup } from '../../../lib/orgs/taskBoard';
import type { MemberFace } from '../../../lib/orgs/useOrgMembers';

const MAX_FACES = 3;

function initialOf(name: string | undefined): string {
  return name && name !== '…' ? name.slice(0, 1).toUpperCase() : '';
}

/** One task on one line: a done tick, its title, when it is due (red when late), and the faces of who is on it. */
export function TaskLine({
  task,
  today,
  faces,
  onTick,
  onOpen,
}: {
  task: GroupTask;
  today: string;
  faces: Record<string, MemberFace>;
  onTick: (done: boolean) => void;
  onOpen: () => void;
}) {
  const { t } = useT();
  const done = task.doneAt !== null;
  const late = isTaskOverdue(task, today);
  const people = taskPeople(task);
  const when = done && task.doneAt
    ? t('groups.tasks.doneOn', { date: formatDate(task.doneAt, 'short') })
    : task.dueOn
      ? formatDayKey(task.dueOn, 'dayMonthShort')
      : t('groups.tasks.noDate');
  const detail = [
    late ? t('groups.tasks.overdue') : null,
    when,
    task.slots !== null ? t('groups.tasks.shift.slots', { claimed: task.claimedUids.length, slots: task.slots }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <HStack gap={3} className="items-center px-3 py-2 border-t border-subtle" testID={`task-row-${task.id}`}>
      <Checkbox value={done} onValueChange={onTick} testID={`task-tick-${task.id}`} />
      <Pressable className="flex-1" accessibilityRole="button" onPress={onOpen} testID={`task-edit-${task.id}`}>
        <HStack gap={2} className="items-center">
          <VStack gap={0} className="flex-1">
            <Text className={done ? 'line-through' : 'font-semibold'} tone={done ? 'muted' : 'primary'} numberOfLines={1}>
              {task.title}
            </Text>
            <Text variant="caption" tone={late ? 'danger' : 'muted'} className={late ? 'font-bold' : undefined} numberOfLines={1}>
              {detail}
            </Text>
          </VStack>
          {people.length > 0 ? (
            <HStack className="items-center" testID={`task-row-people-${task.id}`}>
              {people.slice(0, MAX_FACES).map((uid, i) => (
                <View key={uid} style={{ marginLeft: i === 0 ? 0 : -6 }} className="rounded-full border-2 border-surface-elevated">
                  <Avatar uri={faces[uid]?.photoURL ?? null} size={24} initials={initialOf(faces[uid]?.name)} />
                </View>
              ))}
              {people.length > MAX_FACES ? (
                <Text variant="caption" tone="muted" className="ml-1">
                  +{people.length - MAX_FACES}
                </Text>
              ) : null}
            </HStack>
          ) : (
            <Text variant="caption" tone="muted">
              {t('groups.tasks.unassigned')}
            </Text>
          )}
        </HStack>
      </Pressable>
    </HStack>
  );
}

/**
 * An event and its tasks, folded open or closed. The header always says how
 * far its checklist is, so a closed event hides nothing that matters; open,
 * it lists its tasks and how to add to them.
 */
export function TaskGroupFold({
  group,
  progress,
  expanded,
  onToggle,
  children,
}: {
  group: TaskGroup<GroupTask>;
  /** The event's whole checklist, whatever the filters show. */
  progress: { done: number; total: number } | null;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const { event } = group;
  const summary = event
    ? [
        formatDate(event.startDate, 'short'),
        progress && progress.total > 0
          ? t('groups.tasks.checklists.progress', { done: progress.done, total: progress.total })
          : t('groups.tasks.checklists.empty'),
      ].join(' · ')
    : t('groups.tasks.groupCount', { count: group.tasks.length });
  const ratio = progress && progress.total > 0 ? progress.done / progress.total : 0;

  return (
    <View className="bg-surface-elevated rounded-xl overflow-hidden" testID={`task-group-${group.key}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        className="px-3 py-2.5"
        testID={`task-group-toggle-${group.key}`}
      >
        <HStack gap={2} className="items-center">
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={iconSizes.sm} color={palette.moss} />
          <VStack gap={0} className="flex-1">
            <Text className="font-bold" numberOfLines={1}>
              {event ? event.title : t('groups.tasks.otherTasks')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {summary}
            </Text>
          </VStack>
          {event && progress && progress.total > 0 ? (
            <View className="h-1.5 rounded-full bg-skeleton overflow-hidden" style={{ width: 44 }}>
              <View className="h-full rounded-full bg-success" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </View>
          ) : null}
        </HStack>
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}
