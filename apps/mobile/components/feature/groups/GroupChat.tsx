import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import type { GroupNotificationPrefsData } from '@cultuvilla/shared/models/notification';
import { GROUP_CHAT_PAGE_SIZE, groupChatMessagePath } from '@cultuvilla/shared/models/organization';
import { getBlockedUserIds } from '@cultuvilla/shared/services/blockedUserService';
import {
  deleteGroupChatMessage,
  markGroupChatRead,
  sendGroupChatMessage,
  setGroupChatPush,
  watchGroupChat,
  type GroupChatMessage,
} from '@cultuvilla/shared/services/groupChatService';
import { watchGroupNotificationPrefs } from '@cultuvilla/shared/services/groupMessageService';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { HStack, Input, Pressable, Text, Toggle, VStack } from '../../primitives';
import { ReportSheet, type ReportTarget } from '../ReportSheet';
import { OptionsSheet } from './OptionsSheet';
import { useAuth } from '../../../lib/auth/useAuth';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';

function MessageBubble({
  message,
  mine,
  onOptions,
}: {
  message: GroupChatMessage;
  mine: boolean;
  onOptions: (message: GroupChatMessage) => void;
}) {
  const { t } = useT();
  return (
    <HStack gap={1} align="start" className={mine ? 'justify-end' : 'justify-start'} testID={`group-chat-message-${message.id}`}>
      <View className={`rounded-lg px-3 py-2 ${mine ? 'bg-accent-subtle/30' : 'bg-surface-elevated'}`} style={{ maxWidth: '85%' }}>
        <HStack gap={2} align="center" justify="between">
          <Text variant="caption" className="font-bold shrink" numberOfLines={1}>
            {message.authorName}
          </Text>
          <Text variant="caption" tone="muted">
            {formatCompactRelativeTime(message.createdAt)}
          </Text>
        </HStack>
        <Text selectable>{message.body}</Text>
      </View>
      <Pressable
        testID={`group-chat-options-${message.id}`}
        accessibilityRole="button"
        accessibilityLabel={t('groups.chat.options')}
        hitSlop={8}
        onPress={() => onOptions(message)}
        className="py-2"
      >
        <Ionicons name="ellipsis-vertical" size={iconSizes.sm} color={colors.light.fg.muted} />
      </Pressable>
    </HStack>
  );
}

/** The one switch for chat notifications, general and avisos alike. Off until the member turns it on. */
function ChatPushToggle({ orgId, uid }: { orgId: string; uid: string }) {
  const { t } = useT();
  const prefs = useWatch<GroupNotificationPrefsData | null>('groups:watchGroupNotificationPrefs', `${uid}|${orgId}`, (next, error) =>
    watchGroupNotificationPrefs(uid, orgId, next, error),
  );
  if (prefs.status !== 'ready') return null;
  return (
    <VStack gap={1} className="pb-3">
      <Toggle
        testID="group-chat-push"
        value={prefs.data?.chatPush ?? false}
        label={t('groups.chat.push')}
        onValueChange={(on) => void setGroupChatPush(uid, orgId, on, prefs.data ?? null).catch(() => showAlert(t('groups.chat.pushError')))}
      />
      <Text variant="caption" tone="muted">
        {t('groups.chat.pushHint')}
      </Text>
    </VStack>
  );
}

/**
 * One thread of a group's chat, newest at the bottom: the Charla, or the chat
 * under an aviso (`head` is the aviso, drawn as the thread's first message).
 * Opening it marks it read. Messages from people the viewer blocked are hidden,
 * and each message offers the report, block and delete it may.
 */
export function GroupChat({
  orgId,
  municipalityId,
  threadId,
  uid,
  canModerate,
  closedHint,
  head,
}: {
  orgId: string;
  municipalityId: string;
  threadId: string;
  uid: string;
  /** An admin of the group: may delete anyone's message. */
  canModerate: boolean;
  /** Set when the viewer may not write here: said in place of the composer. */
  closedHint?: string;
  head?: ReactNode;
}) {
  const { t } = useT();
  const { profile } = useAuth();
  const [count, setCount] = useState(GROUP_CHAT_PAGE_SIZE);
  const [body, setBody] = useState('');
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [optionsFor, setOptionsFor] = useState<GroupChatMessage | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);

  const watch = useWatch<GroupChatMessage[]>(
    'groups:watchGroupChat',
    `${orgId}|${threadId}|${count}`,
    (next, error) => watchGroupChat(orgId, threadId, count, next, error),
  );
  // Asking for an older page resubscribes: keep what is on screen until it answers.
  const lastRows = useRef<GroupChatMessage[]>([]);
  if (watch.data) lastRows.current = watch.data;
  const rows = useMemo(() => {
    const all = watch.data ?? lastRows.current;
    return all.filter((m) => !blocked.has(m.authorUid));
  }, [watch.data, blocked]);

  useEffect(() => {
    let live = true;
    void getBlockedUserIds(uid)
      .then((ids) => {
        if (live) setBlocked(new Set(ids));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [uid]);

  const newestId = watch.data?.[0]?.id ?? null;
  useEffect(() => {
    void markGroupChatRead(orgId, threadId, uid).catch(() => undefined);
  }, [orgId, threadId, uid, newestId]);

  const authorName = profile?.displayName ?? '';
  const send = () => {
    const text = body.trim();
    if (!text || !authorName) return;
    setBody('');
    // Not awaited for the UI: offline, the write resolves only on reconnect and
    // the listener shows the message from the cache at once.
    sendGroupChatMessage({ orgId, threadId, uid, authorName, body: text }).catch(() => {
      setBody((current) => current || text);
      showAlert(t('groups.chat.sendError'));
    });
  };

  const confirmDelete = (message: GroupChatMessage) =>
    showConfirm(t('groups.chat.deleteTitle'), t('groups.chat.deleteBody'), () => {
      void deleteGroupChatMessage(orgId, threadId, message.id).catch(() => showAlert(t('groups.chat.deleteError')));
    });

  const options = optionsFor
    ? [
        ...(optionsFor.authorUid === uid || canModerate ? [{ key: 'delete', label: t('groups.chat.delete') }] : []),
        ...(optionsFor.authorUid !== uid ? [{ key: 'report', label: t('groups.chat.report') }] : []),
      ]
    : [];

  const pick = (key: string) => {
    const message = optionsFor;
    setOptionsFor(null);
    if (!message) return;
    if (key === 'delete') confirmDelete(message);
    else {
      setReport({
        kind: 'comment',
        id: groupChatMessagePath(orgId, threadId, message.id),
        municipalityId,
        authorUserId: message.authorUid,
        text: message.body,
      });
    }
  };

  return (
    <View className="flex-1" testID={`group-chat-${threadId}`}>
      <FlatList
        inverted
        data={rows}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-4 py-3 gap-2"
        testID="group-chat-list"
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if ((watch.data ?? []).length >= count) setCount((c) => c + GROUP_CHAT_PAGE_SIZE);
        }}
        renderItem={({ item }) => <MessageBubble message={item} mine={item.authorUid === uid} onOptions={setOptionsFor} />}
        ListFooterComponent={
          <VStack gap={2} className="pb-2">
            <ChatPushToggle orgId={orgId} uid={uid} />
            {head}
            {watch.status === 'error' ? (
              <Text tone="danger" testID="group-chat-error">
                {t('groups.chat.loadError')}
              </Text>
            ) : watch.status === 'ready' && rows.length === 0 ? (
              <Text tone="muted" className="py-4 text-center" testID="group-chat-empty">
                {t('groups.chat.empty')}
              </Text>
            ) : null}
          </VStack>
        }
      />
      {closedHint ? (
        <Text tone="muted" variant="bodySm" className="px-4 py-3 border-t border-subtle text-center" testID="group-chat-closed">
          {closedHint}
        </Text>
      ) : (
        <View className="px-4 py-2 border-t border-subtle">
          <Input
            value={body}
            onChangeText={setBody}
            placeholder={t('groups.chat.placeholder')}
            accessibilityLabel={t('groups.chat.placeholder')}
            testID="group-chat-input"
            maxLength={2000}
            pill
            autoGrow
            rightAdornment={
              body.trim().length > 0 ? (
                <Pressable
                  testID="group-chat-send"
                  accessibilityRole="button"
                  accessibilityLabel={t('groups.chat.send')}
                  onPress={send}
                >
                  <Ionicons name="arrow-up-circle" size={iconSizes.lg} color={colors.light.bg.accent} />
                </Pressable>
              ) : null
            }
          />
        </View>
      )}
      <OptionsSheet
        visible={optionsFor !== null}
        title={t('groups.chat.options')}
        options={options}
        onPick={pick}
        onClose={() => setOptionsFor(null)}
        testID="group-chat-options"
      />
      <ReportSheet
        visible={report !== null}
        target={report}
        reporterUserId={uid}
        onClose={() => setReport(null)}
        onBlocked={(id) => setBlocked((current) => new Set(current).add(id))}
      />
    </View>
  );
}
