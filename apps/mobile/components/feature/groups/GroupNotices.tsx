import { useEffect, useMemo, useRef } from 'react';
import type { GroupNotificationPrefsData } from '@cultuvilla/shared/models/notification';
import {
  castGroupPollVote,
  markGroupMessageRead,
  setGroupMessagesMuted,
  watchGroupNotificationPrefs,
  watchMyGroupMessageReads,
  watchMyGroupMessages,
  watchMyGroupPollVotes,
  type GroupMessage,
  type GroupMessageRead,
  type GroupPollVote,
} from '@cultuvilla/shared/services/groupMessageService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Card, Pressable, Text, Toggle, VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/** Pinned first, then newest. */
function noticeOrder(a: GroupMessage, b: GroupMessage): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return b.sentAt.getTime() - a.sentAt.getTime();
}

/**
 * The member's side of messaging, on the group home: the notices that reached
 * them — pinned ones on top — each marked read once shown, with its poll to
 * answer; and the switch that mutes this group's message pushes.
 */
export function GroupNotices({ orgId, uid }: { orgId: string; uid: string }) {
  const { t } = useT();
  const messages = useWatch<GroupMessage[]>('groups:watchMyGroupMessages', `${orgId}|${uid}`, (next, error) =>
    watchMyGroupMessages(orgId, uid, next, error),
  );
  const notices = useMemo(() => [...(messages.data ?? [])].sort(noticeOrder), [messages.data]);
  const ids = useMemo(() => notices.map((m) => m.id), [notices]);
  const idsKey = ids.join(',');
  const pollIds = useMemo(() => notices.filter((m) => m.poll).map((m) => m.id), [notices]);
  const pollKey = pollIds.join(',');
  const reads = useWatch<GroupMessageRead[]>(
    'groups:watchMyGroupMessageReads',
    ids.length > 0 ? `${orgId}|${uid}|${idsKey}` : null,
    ids.length > 0 ? (next, error) => watchMyGroupMessageReads(orgId, uid, ids, next, error) : null,
  );
  const votes = useWatch<GroupPollVote[]>(
    'groups:watchMyGroupPollVotes',
    pollIds.length > 0 ? `${orgId}|${uid}|${pollKey}` : null,
    pollIds.length > 0 ? (next, error) => watchMyGroupPollVotes(orgId, uid, pollIds, next, error) : null,
  );
  const prefs = useWatch<GroupNotificationPrefsData | null>('groups:watchGroupNotificationPrefs', `${uid}|${orgId}`, (next, error) =>
    watchGroupNotificationPrefs(uid, orgId, next, error),
  );

  const readIds = useMemo(() => new Set((reads.data ?? []).map((r) => r.id)), [reads.data]);
  const voteOf = useMemo(() => new Map((votes.data ?? []).map((v) => [v.id, v.option])), [votes.data]);
  // Shown is read: mark each unread notice once, while its read list is loaded.
  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (reads.status !== 'ready') return;
    for (const m of notices) {
      if (readIds.has(m.id) || m.sentBy === uid || marked.current.has(m.id)) continue;
      marked.current.add(m.id);
      void markGroupMessageRead(orgId, m.id, uid).catch(() => marked.current.delete(m.id));
    }
  }, [reads.status, notices, readIds, orgId, uid]);

  if (messages.status !== 'ready' || notices.length === 0) return null;

  return (
    <VStack gap={2} testID="group-notices">
      <DetailSectionHeading>{t('groups.messages.noticesTitle')}</DetailSectionHeading>
      {notices.map((m) => {
        const fresh = reads.status === 'ready' && !readIds.has(m.id) && m.sentBy !== uid;
        const myVote = voteOf.get(m.id);
        return (
          <Card key={m.id} testID={`group-notice-${m.id}`}>
            <VStack gap={1}>
              {m.pinned || fresh ? (
                <Text variant="caption" className="text-accent font-bold">
                  {[m.pinned ? t('groups.messages.pinnedBadge') : null, fresh ? t('groups.messages.newBadge') : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              <Text className="font-bold">{m.title}</Text>
              <Text selectable>{m.body}</Text>
              <Text variant="caption" tone="muted">
                {t('groups.messages.sentBy', { name: m.signerName, date: formatDate(m.sentAt) })}
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
