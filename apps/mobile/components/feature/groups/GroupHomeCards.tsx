import type { GroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { View } from 'react-native';
import { Avatar, Card, HStack, Pressable, Text, VStack } from '../../primitives';
import type { MemberFace } from '../../../lib/orgs/useOrgMembers';
import { useT } from '../../../lib/i18n';

/** A notice in the group home's Avisos row: what it says, at a glance.
 * The cards fill their row with `flex-1`, never `h-full`: on native Yoga
 * resolves height:100% against the ScrollView viewport, so a card grew
 * without end (same bug as DetailInfoCard). */
export function NoticeCard({ message, unread, onPress }: { message: GroupMessage; unread: boolean; onPress: () => void }) {
  const { t } = useT();
  const badge = [message.pinned ? t('groups.messages.pinnedBadge') : null, unread ? t('groups.messages.newBadge') : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={`group-home-notice-${message.id}`} style={{ width: 260 }}>
      <Card className="flex-1">
        <VStack gap={1}>
          {badge ? (
            <Text variant="caption" className="text-accent font-bold">
              {badge}
            </Text>
          ) : null}
          <Text className="font-bold" numberOfLines={2}>
            {message.title}
          </Text>
          <Text variant="bodySm" numberOfLines={3}>
            {message.body}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {t('groups.messages.sentBy', { name: message.signerName, date: formatDate(message.sentAt) })}
          </Text>
        </VStack>
      </Card>
    </Pressable>
  );
}

/** Who a card shows as on the task: its assignees, or a shift's volunteers. */
export function taskPeople(task: Pick<GroupTask, 'slots' | 'assigneeUids' | 'claimedUids'>): string[] {
  return task.slots !== null ? task.claimedUids : task.assigneeUids;
}

const MAX_FACES = 4;

/**
 * A task or volunteer shift in the group home's Próximas tareas row: its day,
 * the event it is for, and the faces of who is on it.
 */
export function TaskCard({
  task,
  eventTitle,
  faces,
  onPress,
}: {
  task: GroupTask;
  eventTitle: string | null;
  faces: Record<string, MemberFace>;
  onPress: () => void;
}) {
  const { t } = useT();
  const people = taskPeople(task);
  const shown = people.slice(0, MAX_FACES);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={`group-home-task-${task.id}`} style={{ width: 200 }}>
      <Card className="flex-1">
        <VStack gap={2} className="flex-1">
          <HStack gap={1} align="center">
            <Ionicons name="calendar-clear-outline" size={iconSizes.sm} color={colors.light.fg.accent} />
            <Text variant="caption" className="text-accent font-bold" testID={`group-home-task-${task.id}-date`}>
              {task.dueOn ? formatDayKey(task.dueOn, 'dayMonthShort') : t('groups.tasks.noDate')}
            </Text>
          </HStack>
          <Text className="font-bold" numberOfLines={2}>
            {task.title}
          </Text>
          {eventTitle ? (
            <Text variant="bodySm" tone="muted" numberOfLines={1} testID={`group-home-task-${task.id}-event`}>
              {eventTitle}
            </Text>
          ) : null}
          <View className="flex-1" />
          {shown.length > 0 ? (
            <HStack align="center" testID={`group-home-task-${task.id}-people`}>
              {shown.map((uid, i) => (
                <View key={uid} style={{ marginLeft: i === 0 ? 0 : -8 }} className="rounded-full border-2 border-surface">
                  <Avatar uri={faces[uid]?.photoURL ?? null} size={28} initials={initialOf(faces[uid]?.name)} />
                </View>
              ))}
              {people.length > shown.length ? (
                <Text variant="caption" tone="muted" className="ml-2">
                  +{people.length - shown.length}
                </Text>
              ) : null}
            </HStack>
          ) : (
            <Text variant="caption" tone="muted">
              {t('groups.tasks.unassigned')}
            </Text>
          )}
        </VStack>
      </Card>
    </Pressable>
  );
}

function initialOf(name: string | undefined): string {
  return name && name !== '…' ? name.slice(0, 1).toUpperCase() : '';
}
