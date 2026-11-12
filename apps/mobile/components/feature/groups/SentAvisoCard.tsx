import { useState } from 'react';
import { View } from 'react-native';
import { canNudgeGroupMessage, tallyGroupPoll, unreadRecipientUids } from '@cultuvilla/shared/models/organization';
import {
  nudgeGroupMessage,
  watchGroupMessageReads,
  watchGroupPollVotes,
  type GroupMessage,
  type GroupMessageRead,
  type GroupPollVote,
} from '@cultuvilla/shared/services/groupMessageService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/**
 * One sent aviso in the junta's list: how many have read it, the poll's
 * result and the nudge, without opening it. Counts come from the reads and
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
  const [nudging, setNudging] = useState(false);

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

  const nudge = () => {
    setNudging(true);
    nudgeGroupMessage(orgId, message.id)
      .then((r) => showAlert(t('groups.messages.nudged', { count: r.nudged })))
      .catch(() => showAlert(t('groups.messages.actionError')))
      .finally(() => setNudging(false));
  };

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
            <HStack gap={2} align="center" justify="between">
              <Text variant="bodySm" tone="muted" className="flex-1" testID={`group-msg-row-reads-${message.id}`}>
                {t('groups.messages.readBar', { read, total: inApp })}
              </Text>
              {unread > 0 && canNudgeGroupMessage(message, new Date()) ? (
                <Button variant="secondary" onPress={nudge} loading={nudging} testID={`group-msg-row-nudge-${message.id}`}>
                  {t('groups.messages.remind', { count: unread })}
                </Button>
              ) : null}
            </HStack>
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
