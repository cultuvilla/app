import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { setGroupTaskDone, watchGroupTask, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { watchEvent } from '@cultuvilla/shared/services/eventService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Avatar, Button, HStack, Pressable, Screen, Text, VStack } from '../../../../components/primitives';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DetailSectionHeading } from '../../../../components/feature/DetailSectionHeading';
import { SegmentedToggle } from '../../../../components/feature/SegmentedToggle';
import { taskPeople } from '../../../../components/feature/groups/GroupHomeCards';
import { TaskComments } from '../../../../components/feature/groups/TaskComments';
import { ShiftCard } from '../../../../components/feature/groups/TaskRows';
import { TaskSheet } from '../../../../components/feature/groups/TaskSheet';
import { GroupContactGate } from '../../../../components/feature/groups/GroupContactGate';
import { useAuth } from '../../../../lib/auth/useAuth';
import { showAlert } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { groupEventHref, routes } from '../../../../lib/navigation/routes';
import { taskWhenLabel } from '../../../../lib/orgs/tasks';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';
import { useMemberFaces, useOrgMembers } from '../../../../lib/orgs/useOrgMembers';

/**
 * One task of a group: when it is, who is on it, its comments, and closing or
 * reopening it. Any member does all of that; the group's admins and whoever
 * created it may also delete it, from the edit form.
 */
export default function GroupTaskScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { grupo, tarea } = useLocalSearchParams<{ grupo: string; tarea: string }>();
  const { groups, status } = useMyGroups(uid);
  const group = groups.find((g) => g.org.id === grupo) ?? null;
  const orgId = group?.org.id ?? null;
  const isAdmin = group?.role === 'admin';
  const watch = useWatch<GroupTask | null>(
    'groups:watchGroupTask',
    orgId && tarea ? `${orgId}|${tarea}` : null,
    orgId && tarea ? (next, error) => watchGroupTask(orgId, tarea, next, error) : null,
  );
  const task = watch.data ?? null;
  const eventId = task?.eventId ?? null;
  const event = useWatch<(EventData & { id: string }) | null>(
    'groups:watchEvent',
    eventId,
    eventId ? (next, error) => watchEvent(eventId, next, error) : null,
  );
  const { members, nameOf } = useOrgMembers(orgId ?? '');
  const people = task ? taskPeople(task) : [];
  const faces = useMemberFaces(people);
  const [tab, setTab] = useState<'details' | 'comments'>('details');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (uid && status !== 'loading' && !group) return <Redirect href={routes.groups} />;

  const setDone = (done: boolean) => {
    if (!uid || !orgId || !task) return;
    setSaving(true);
    setGroupTaskDone(orgId, task.id, done, uid)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setSaving(false));
  };

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={t('groups.tasks.detail.title')} />
      <GroupContactGate group={group} uid={uid}>
      {!uid || !orgId || watch.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !task ? (
        <Text tone="muted" className="p-6 text-center" testID="group-task-unavailable">
          {t('groups.tasks.detail.unavailable')}
        </Text>
      ) : (
        <>
          <View className="px-4 pt-3">
            <SegmentedToggle
              testID="task-tab"
              value={tab}
              options={[
                { value: 'details', label: t('groups.tasks.comments.tabDetails') },
                { value: 'comments', label: t('groups.tasks.comments.tabComments') },
              ]}
              onChange={setTab}
            />
          </View>
          {tab === 'comments' ? (
            <TaskComments orgId={orgId} taskId={task.id} uid={uid} isAdmin={isAdmin} />
          ) : (
            <ScrollView contentContainerClassName="px-4 pt-4 pb-16" testID="group-task">
              <VStack gap={4}>
                <VStack gap={1}>
                  <Text variant="h2" className={task.doneAt ? 'font-bold line-through' : 'font-bold'}>
                    {task.title}
                  </Text>
                  <Text variant="bodySm" tone="muted">
                    {task.doneAt
                      ? t('groups.tasks.doneBy', { name: task.doneBy ? nameOf(task.doneBy) : '—', date: formatDate(task.doneAt, 'short') })
                      : taskWhenLabel(t, task)}
                  </Text>
                  {event.data ? (
                    <Pressable
                      testID="group-task-event"
                      accessibilityRole="link"
                      onPress={() => router.push(groupEventHref(orgId, event.data?.id ?? ''))}
                    >
                      <Text variant="bodySm" className="text-accent font-medium">
                        {t('groups.tasks.detail.event', { title: event.data.title })}
                      </Text>
                    </Pressable>
                  ) : null}
                </VStack>

                {task.notes ? <Text selectable>{task.notes}</Text> : null}

                <VStack gap={2}>
                  <DetailSectionHeading>{t('groups.tasks.detail.people')}</DetailSectionHeading>
                  {people.length === 0 ? (
                    <Text variant="bodySm" tone="muted">
                      {t('groups.tasks.unassigned')}
                    </Text>
                  ) : (
                    people.map((personUid) => (
                      <HStack key={personUid} gap={3} align="center" testID={`group-task-person-${personUid}`}>
                        <Avatar
                          uri={faces[personUid]?.photoURL ?? null}
                          size={36}
                          initials={nameOf(personUid).slice(0, 1).toUpperCase()}
                        />
                        <Text className="flex-1" numberOfLines={1}>
                          {nameOf(personUid)}
                        </Text>
                      </HStack>
                    ))
                  )}
                </VStack>

                {/* The shift's own answer: apuntarse, or leave it. */}
                {task.slots !== null && !task.doneAt ? (
                  <ShiftCard task={task} orgId={orgId} uid={uid} nameOf={nameOf} showNames={isAdmin} />
                ) : null}

                <VStack gap={2}>
                  <Button fullWidth loading={saving} testID="group-task-done" onPress={() => setDone(task.doneAt === null)}>
                    {t(task.doneAt ? 'groups.tasks.detail.reopen' : 'groups.tasks.detail.markDone')}
                  </Button>
                  <Button fullWidth variant="secondary" testID="group-task-edit" onPress={() => setEditing(true)}>
                    {t('common.edit')}
                  </Button>
                </VStack>
              </VStack>
            </ScrollView>
          )}
          <TaskSheet
            visible={editing}
            orgId={orgId}
            uid={uid}
            task={task}
            eventId={task.eventId}
            members={members}
            canDelete={isAdmin || task.createdBy === uid}
            onClose={() => setEditing(false)}
          />
        </>
      )}
      </GroupContactGate>
    </Screen>
  );
}
