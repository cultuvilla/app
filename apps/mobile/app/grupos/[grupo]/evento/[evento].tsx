import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import type { EventData } from '@cultuvilla/shared/models/event/EventDataModel';
import { compareTasksByDue } from '@cultuvilla/shared/models/organization';
import { watchEvent } from '@cultuvilla/shared/services/eventService';
import { setGroupTaskDone, watchEventGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, RemoteImage, Screen, Text, VStack } from '../../../../components/primitives';
import { ScreenHeader } from '../../../../components/layout/ScreenHeader';
import { DetailSectionHeading } from '../../../../components/feature/DetailSectionHeading';
import { TaskRow } from '../../../../components/feature/groups/TaskRows';
import { TaskSheet } from '../../../../components/feature/groups/TaskSheet';
import { useAuth } from '../../../../lib/auth/useAuth';
import { showAlert } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { eventHref, groupTaskHref, routes } from '../../../../lib/navigation/routes';
import { useMyGroups } from '../../../../lib/orgs/useMyGroups';
import { useOrgMembers } from '../../../../lib/orgs/useOrgMembers';

/**
 * A group's event from the organizing side: its tasks, which any member
 * creates, edits and ticks. What the public sees stays on the event's own page,
 * one button away.
 */
export default function GroupEventScreen() {
  const { t } = useT();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { grupo, evento } = useLocalSearchParams<{ grupo: string; evento: string }>();
  const { groups, status } = useMyGroups(uid);
  const group = groups.find((g) => g.org.id === grupo) ?? null;
  const orgId = group?.org.id ?? null;
  const event = useWatch<(EventData & { id: string }) | null>('groups:watchEvent', orgId && evento ? evento : null, (next, error) =>
    watchEvent(evento, next, error),
  );
  const tasks = useWatch<GroupTask[]>(
    'groups:watchEventGroupTasks',
    orgId && evento ? `${orgId}|${evento}` : null,
    orgId && evento ? (next, error) => watchEventGroupTasks(orgId, evento, next, error) : null,
  );
  const { members, nameOf } = useOrgMembers(orgId ?? '');
  const rows = useMemo(() => [...(tasks.data ?? [])].sort(compareTasksByDue), [tasks.data]);
  const [adding, setAdding] = useState(false);

  if (uid && status !== 'loading' && !group) return <Redirect href={routes.groups} />;

  const data = event.data ?? null;
  const image = data?.imageURL ?? data?.villageCoverImage ?? null;
  const doneCount = rows.filter((r) => r.doneAt !== null).length;

  return (
    <Screen padded={false} topInset={false}>
      <ScreenHeader accent title={data?.title ?? t('groups.sections.eventos')} />
      {!uid || !orgId || event.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !data ? (
        <Text tone="muted" className="p-6 text-center" testID="group-event-unavailable">
          {t('groups.tasks.checklists.eventUnavailable')}
        </Text>
      ) : (
        <ScrollView contentContainerClassName="px-4 pt-3 pb-16" testID="group-event">
          <VStack gap={4}>
            {image ? (
              <View className="overflow-hidden rounded-lg" style={{ aspectRatio: 2 }}>
                <RemoteImage uri={image} variant="card" style={{ width: '100%', height: '100%' }} />
              </View>
            ) : null}
            <VStack gap={1}>
              <Text>{formatDate(data.startDate, 'short')}</Text>
              {data.location?.displayName ? (
                <Text variant="bodySm" tone="muted">
                  {data.location.displayName}
                </Text>
              ) : null}
            </VStack>
            <Button size="md" variant="secondary" testID="group-event-public-page" onPress={() => router.push(eventHref(data))}>
              {t('groups.tasks.checklists.viewEventPage')}
            </Button>

            <VStack gap={2}>
              <DetailSectionHeading>{t('groups.sections.tareas')}</DetailSectionHeading>
              <Text variant="bodySm" tone="muted">
                {rows.length === 0
                  ? t('groups.tasks.checklists.noTasks')
                  : t('groups.tasks.checklists.progress', { done: doneCount, total: rows.length })}
              </Text>
              {rows.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  canTick
                  onTick={(done) => {
                    setGroupTaskDone(orgId, task.id, done, uid).catch(() => showAlert(t('groups.tasks.error')));
                  }}
                  onEdit={() => router.push(groupTaskHref(orgId, task.id))}
                  nameOf={nameOf}
                />
              ))}
              <Button size="md" testID="group-event-add-task" onPress={() => setAdding(true)}>
                {t('groups.tasks.checklists.addTask')}
              </Button>
            </VStack>
          </VStack>
        </ScrollView>
      )}
      {uid && orgId ? (
        <TaskSheet
          visible={adding}
          orgId={orgId}
          uid={uid}
          task={null}
          eventId={evento}
          members={members}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </Screen>
  );
}
