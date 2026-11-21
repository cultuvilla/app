import { View } from 'react-native';
import { tallyGroupPoll, unreadRecipientUids } from '@cultuvilla/shared/models/organization';
import {
  watchGroupMessageReads,
  watchGroupPollVotes,
  type GroupMessage,
  type GroupMessageRead,
  type GroupPollVote,
} from '@cultuvilla/shared/services/groupMessageService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';

/**
 * One sent aviso in the junta's list: how many have read it and the poll's
 * result, without opening it. Counts come from the reads and
 * votes the detail already watches, so no read model is needed.
 */
export function SentAvisoCard({ message, orgId, onOpen }: { message: GroupMessage; orgId: string; onOpen: () => void }) {
  const { t } = useT();
  const key = `${orgId}|${message.id}`;
  const reads = useWatch<GroupMessageRead[]>('groups:watchGroupMessageReads', key, (next, error) =>
    watchGroupMessageReads(orgId, message.id, next, error),
  );
  const votes = useWatch<GroupPollVote[]>(
    'groups:watchGroupPollVotes',
    message.poll ? key : null,
    message.poll ? (next, error) => watchGroupPollVotes(orgId, message.id, next, error) : null,
  );

  const inApp = message.recipientUids.filter((u) => u !== message.sentBy).length;
  const unread = unreadRecipientUids(
    message,
    (reads.data ?? []).map((r) => r.id),
  ).length;
  const read = inApp - unread;
  const audience =
    message.audience.kind === 'event' && message.audience.eventTitle
      ? message.audience.eventTitle
      : t(`groups.messages.audience.${message.audience.kind}`);

  const poll = message.poll;
  const voteRows = votes.data ?? [];
  const tally = poll ? tallyGroupPoll(poll, voteRows) : [];
  const pollLine = poll
    ? [
        ...poll.options.map((option, i) => t('groups.messages.pollTally', { count: tally[i] ?? 0, option })),
        ...(inApp > voteRows.length ? [t('groups.messages.pollNoVote', { count: inApp - voteRows.length })] : []),
      ].join(' · ')
    : null;

  return (
    <Pressable
      testID={`group-msg-row-${message.id}`}
      accessibilityRole="button"
      onPress={onOpen}
      className="rounded-lg p-3 bg-surface-elevated shadow-sm"
    >
      <VStack gap={2}>
        <Text className="font-bold">{message.title}</Text>
        <Text variant="caption" tone="muted">
          {t('groups.messages.summary', { date: formatDate(message.sentAt), audience })}
        </Text>
        {inApp > 0 ? (
          <>
            <View className="h-2 rounded-full bg-subtle overflow-hidden" testID={`group-msg-row-bar-${message.id}`}>
              <View className="h-full rounded-full bg-success" style={{ width: `${Math.round((read / inApp) * 100)}%` }} />
            </View>
            <Text variant="bodySm" tone="muted" testID={`group-msg-row-reads-${message.id}`}>
              {t('groups.messages.readBar', { read, total: inApp })}
            </Text>
          </>
        ) : (
          <Text variant="bodySm" tone="muted">
            {t('groups.messages.recipientCount', { count: message.recipientCount })}
          </Text>
        )}
        {pollLine ? (
          <Text variant="bodySm" tone="muted" testID={`group-msg-row-poll-${message.id}`}>
            {t('groups.messages.pollLabel')}: {pollLine}
          </Text>
        ) : null}
      </VStack>
    </Pressable>
  );
}
