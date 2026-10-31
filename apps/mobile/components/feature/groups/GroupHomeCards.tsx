import type { GroupMessage } from '@cultuvilla/shared/services/groupMessageService';
import type { GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { Card, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

/** A notice in the group home's Avisos row: what it says, at a glance. */
export function NoticeCard({ message, unread, onPress }: { message: GroupMessage; unread: boolean; onPress: () => void }) {
  const { t } = useT();
  const badge = [message.pinned ? t('groups.messages.pinnedBadge') : null, unread ? t('groups.messages.newBadge') : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={`group-home-notice-${message.id}`} style={{ width: 260 }}>
      <Card className="h-full">
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

/** A task or volunteer shift in the group home's row. */
export function TaskCard({ task, onPress }: { task: GroupTask; onPress: () => void }) {
  const { t } = useT();
  const when = task.dueOn
    ? task.time
      ? t('groups.tasks.dueAt', { date: formatDayKey(task.dueOn), time: task.time })
      : t('groups.tasks.due', { date: formatDayKey(task.dueOn) })
    : t('groups.tasks.noDate');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={`group-home-task-${task.id}`} style={{ width: 200 }}>
      <Card className="h-full">
        <VStack gap={1}>
          {task.slots !== null ? (
            <Text variant="caption" className="text-accent font-bold">
              {t('groups.tasks.shift.slots', { claimed: task.claimedUids.length, slots: task.slots })}
            </Text>
          ) : null}
          <Text className="font-bold" numberOfLines={2}>
            {task.title}
          </Text>
          <Text variant="bodySm" tone="muted">
            {when}
          </Text>
        </VStack>
      </Card>
    </Pressable>
  );
}
