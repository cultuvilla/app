import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { GroupNotificationPrefsData } from '@cultuvilla/shared/models/notification';
import {
  castGroupPollVote,
  markGroupMessageRead,
  setGroupMessagesMuted,
  watchGroupNotificationPrefs,
  watchMyGroupPollVotes,
  type GroupPollVote,
} from '@cultuvilla/shared/services/groupMessageService';
import { personalizeGroupMessage } from '@cultuvilla/shared/models/organization';
import { formatDate } from '@cultuvilla/shared/utils';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { Card, HStack, Pressable, Text, Toggle, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { groupAvisoHref } from '../../../lib/navigation/routes';
import { useGroupChatUnread } from '../../../lib/orgs/useGroupChatUnread';
import { useGroupNotices } from '../../../lib/orgs/useGroupNotices';
import { useMyMessageValues } from '../../../lib/orgs/useMyMessageValues';

/**
 * The member's side of messaging, on the group's notices screen: the notices that reached
 * them, newest first, each marked read once shown, with its poll to
 * answer; and the switch that mutes this group's message pushes.
 */
export function GroupNotices({ orgId, uid, empty }: { orgId: string; uid: string; empty?: ReactNode }) {
  const { t } = useT();
  const { notices, status, readsStatus, readIds } = useGroupNotices(orgId, uid);
  const myValues = useMyMessageValues(orgId, uid);
  const noticeIds = useMemo(() => notices.map((m) => m.id), [notices]);
  const { unreadAvisoIds } = useGroupChatUnread(orgId, uid, noticeIds);
  const pollIds = useMemo(() => notices.filter((m) => m.poll).map((m) => m.id), [notices]);
  const pollKey = pollIds.join(',');
  const votes = useWatch<GroupPollVote[]>(
    'groups:watchMyGroupPollVotes',
    pollIds.length > 0 ? `${orgId}|${uid}|${pollKey}` : null,
    pollIds.length > 0 ? (next, error) => watchMyGroupPollVotes(orgId, uid, pollIds, next, error) : null,
  );
  const prefs = useWatch<GroupNotificationPrefsData | null>('groups:watchGroupNotificationPrefs', `${uid}|${orgId}`, (next, error) =>
    watchGroupNotificationPrefs(uid, orgId, next, error),
  );

  const voteOf = useMemo(() => new Map((votes.data ?? []).map((v) => [v.id, v.option])), [votes.data]);
  // Shown is read: mark each unread notice once, while its read list is loaded.
  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (readsStatus !== 'ready') return;
    for (const m of notices) {
      if (readIds.has(m.id) || m.sentBy === uid || marked.current.has(m.id)) continue;
      marked.current.add(m.id);
      void markGroupMessageRead(orgId, m.id, uid).catch(() => marked.current.delete(m.id));
    }
  }, [readsStatus, notices, readIds, orgId, uid]);

  if (status !== 'ready') return null;
  if (notices.length === 0) return empty ? <>{empty}</> : null;

  return (
    <VStack gap={2} testID="group-notices">
      {notices.map((m) => {
        const fresh = readsStatus === 'ready' && !readIds.has(m.id) && m.sentBy !== uid;
        const myVote = voteOf.get(m.id);
        const text = personalizeGroupMessage({ title: m.title, body: m.body }, myValues);
        return (
          <Card key={m.id} testID={`group-notice-${m.id}`}>
            <VStack gap={1}>
              {fresh ? (
                <Text variant="caption" className="text-accent font-bold">
                  {t('groups.messages.newBadge')}
                </Text>
              ) : null}
              <Text className="font-bold">{text.title}</Text>
              <Text selectable>{text.body}</Text>
              <Text variant="caption" tone="muted">
                {formatDate(m.sentAt, 'dayMonthShort')}
              </Text>
              {m.poll ? (
                <VStack gap={1} className="pt-2" testID={`group-notice-poll-${m.id}`}>
                  <Text className="font-bold">{m.poll.question}</Text>
                  {m.poll.options.map((option, i) => {
                    const chosen = myVote === i;
                    return (
                      <Pressable
                        key={i}
                        testID={`group-notice-vote-${m.id}-${i}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: chosen }}
                        onPress={() => void castGroupPollVote(orgId, m.id, uid, i).catch(() => showAlert(t('groups.messages.voteError')))}
                        className={`px-3 py-2 rounded-md border ${chosen ? 'bg-accent border-accent' : 'bg-surface border-subtle'}`}
                      >
                        <Text tone={chosen ? 'onAccent' : 'primary'} className={chosen ? 'font-bold' : ''}>
                          {option}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Text variant="caption" tone="muted">
                    {myVote === undefined
                      ? t('groups.messages.tapToVote')
                      : t('groups.messages.yourVote', { option: m.poll.options[myVote] ?? '' })}
                  </Text>
                </VStack>
              ) : null}
              <Pressable
                testID={`group-notice-chat-${m.id}`}
                accessibilityRole="button"
                onPress={() => router.push(groupAvisoHref(orgId, m.id))}
                className="pt-2"
              >
                <HStack gap={1} align="center">
                  <Ionicons name="chatbubble-ellipses-outline" size={iconSizes.sm} color={colors.light.fg.accent} />
                  <Text variant="bodySm" className="text-accent font-bold">
                    {t(unreadAvisoIds.has(m.id) ? 'groups.chat.openNew' : 'groups.chat.open')}
                  </Text>
                </HStack>
              </Pressable>
            </VStack>
          </Card>
        );
      })}
      {prefs.status === 'ready' ? (
        <VStack gap={1}>
          <Toggle
            testID="group-notices-mute"
            value={prefs.data?.messagesMuted ?? false}
            label={t('groups.messages.mute')}
            onValueChange={(muted) => void setGroupMessagesMuted(uid, orgId, muted).catch(() => showAlert(t('groups.messages.muteError')))}
          />
          <Text variant="caption" tone="muted">
            {t('groups.messages.muteHint')}
          </Text>
        </VStack>
      ) : null}
    </VStack>
  );
}
