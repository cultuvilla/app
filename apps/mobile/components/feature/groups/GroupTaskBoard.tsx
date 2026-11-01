import { useMemo, useState } from 'react';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { spacing } from '@cultuvilla/shared/design-system';
import { madridDayKey } from '@cultuvilla/shared/models/event';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { compareTasksByDue, hasSocioRoster } from '@cultuvilla/shared/models/organization';
import { watchEventsByOrganization } from '@cultuvilla/shared/services/eventService';
import { watchGroupTasksDoneSince, watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { Text } from '../../primitives';
import { Fab } from '../../primitives/Fab';
import { SegmentedToggle } from '../SegmentedToggle';
import { TaskCard, taskPeople } from './GroupHomeCards';
import { GroupTasks } from './GroupTasks';
import { TaskSheet } from './TaskSheet';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { groupTaskHref } from '../../../lib/navigation/routes';
import { useMemberFaces, useOrgMembers } from '../../../lib/orgs/useOrgMembers';
import type { MyGroup } from '../../../lib/orgs/useMyGroups';

type TaskFilter = 'open' | 'mine' | 'done';

/** Midnight on 1 January in Madrid, which is always on CET (+01:00). */
function startOfYear(year: string): Date {
  return new Date(`${year}-01-01T00:00:00+01:00`);
}

/**
 * Every task of the group in two columns, filtered, soonest first: what is
 * still to do, what is on the viewer, or what was done this year. Each opens its
 * own screen, and any member creates one.
 */
export function GroupTaskBoard({ group, uid }: { group: MyGroup; uid: string }) {
  const { t } = useT();
  const { org, role } = group;
  const { width } = useWindowDimensions();
  const year = madridDayKey(new Date()).slice(0, 4);
  const { members } = useOrgMembers(org.id);
  const open = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', org.id, (next, error) => watchOpenGroupTasks(org.id, next, error));
  const done = useWatch<GroupTask[]>('groups:watchGroupTasksDoneSince', `${org.id}|${year}`, (next, error) =>
    watchGroupTasksDoneSince(org.id, startOfYear(year), next, error),
  );
  const events = useWatch<(EventData & { id: string })[]>('groups:watchEventsByOrganization', org.id, (next, error) =>
    watchEventsByOrganization(org.id, { includePrivate: true }, next, error),
  );
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [creating, setCreating] = useState(false);

  const tasks = useMemo(() => {
    if (filter === 'done') return [...(done.data ?? [])].sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));
    const rows = [...(open.data ?? [])].sort(compareTasksByDue);
    return filter === 'mine' ? rows.filter((task) => taskPeople(task).includes(uid)) : rows;
  }, [filter, open.data, done.data, uid]);
  const eventTitles = useMemo(() => new Map((events.data ?? []).map((e) => [e.id, e.title])), [events.data]);
  const faces = useMemberFaces(tasks.flatMap(taskPeople));
  const status = filter === 'done' ? done.status : open.status;
  const cardWidth = (width - spacing[4] * 2 - spacing[3]) / 2;

  return (
    <View className="flex-1">
      <View className="px-4 pt-3">
        <SegmentedToggle
          testID="group-tasks-filter"
          value={filter}
          options={[
            { value: 'open', label: t('groups.tasks.filter.open') },
            { value: 'mine', label: t('groups.tasks.filter.mine') },
            { value: 'done', label: t('groups.tasks.filter.done') },
          ]}
          onChange={setFilter}
        />
      </View>
      <FlatList
        testID="group-task-board"
        data={tasks}
        numColumns={2}
        keyExtractor={(task) => task.id}
        columnWrapperStyle={{ gap: spacing[3] }}
        contentContainerClassName="px-4 pt-3 pb-24 gap-3"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          status === 'loading' ? null : (
            <Text tone="muted" className="py-6 text-center">
              {t(filter === 'done' ? 'groups.tasks.noDone' : 'groups.tasks.noOpen')}
            </Text>
          )
        }
        renderItem={({ item: task }) => (
          <TaskCard
            task={task}
            width={cardWidth}
            eventTitle={task.eventId ? (eventTitles.get(task.eventId) ?? null) : null}
            faces={faces}
            onPress={() => router.push(groupTaskHref(org.id, task.id))}
          />
        )}
        ListFooterComponent={
          <View className="pt-6">
            <GroupTasks orgId={org.id} uid={uid} isAdmin={role === 'admin'} includePrivateEvents suggestAsamblea={hasSocioRoster(org.type)} />
          </View>
        }
      />
      <Fab testID="group-tasks-create" label={t('groups.tasks.new')} onPress={() => setCreating(true)} />
      <TaskSheet visible={creating} orgId={org.id} uid={uid} task={null} members={members} onClose={() => setCreating(false)} />
    </View>
  );
}
