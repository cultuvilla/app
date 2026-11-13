import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import {
  GROUP_CHAT_PAGE_SIZE,
  groupChatLayout,
  groupChatMessagePath,
  nextGroupChatReaction,
  type GroupChatReaction,
} from '@cultuvilla/shared/models/organization';
import { getBlockedUserIds } from '@cultuvilla/shared/services/blockedUserService';
import {
  deleteGroupChatMessage,
  markGroupChatRead,
  sendGroupChatMessage,
  setGroupChatReaction,
  watchGroupChat,
  type GroupChatMessage,
} from '@cultuvilla/shared/services/groupChatService';
import { HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { ReportSheet, type ReportTarget } from '../ReportSheet';
import { ChatMessageRow, ChatQuote } from './ChatMessageRow';
import { ChatMessageSheet, type ChatMessageAction } from './ChatMessageSheet';
import { copyText } from '../../../lib/clipboard';
import { useAuth } from '../../../lib/auth/useAuth';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useComposerKeyboardGap } from '../../../lib/keyboard/useKeyboardOpen';
import { useT } from '../../../lib/i18n';

/**
 * One thread of a group's chat, newest at the bottom: the Charla, or the chat
 * under an aviso (`head` is the aviso, drawn as the thread's first message).
 * Opening it marks it read. Drawn like WhatsApp: a day separator, one author's
 * consecutive messages under one name. Messages from people the viewer blocked
 * are hidden. A long-press on a message reacts to it, or replies, reports,
 * blocks or deletes as the viewer may; reacting stays open where only the
 * junta writes.
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
  const keyboardGap = useComposerKeyboardGap();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [optionsFor, setOptionsFor] = useState<GroupChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<GroupChatMessage | null>(null);
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
  const layout = useMemo(() => groupChatLayout(rows), [rows]);

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
    const quoted = replyTo;
    setBody('');
    setReplyTo(null);
    // Not awaited for the UI: offline, the write resolves only on reconnect and
    // the listener shows the message from the cache at once.
    sendGroupChatMessage({
      orgId,
      threadId,
      uid,
      authorName,
      body: text,
      ...(quoted ? { replyTo: quoted } : {}),
    }).catch(() => {
      setBody((current) => current || text);
      setReplyTo((current) => current ?? quoted);
      showAlert(t('groups.chat.sendError'));
    });
  };

  const react = (message: GroupChatMessage, picked: GroupChatReaction) => {
    void setGroupChatReaction(orgId, threadId, message.id, uid, nextGroupChatReaction(message.reactions?.[uid], picked)).catch(
      () => showAlert(t('groups.chat.reactError')),
    );
  };

  const confirmDelete = (message: GroupChatMessage) =>
    showConfirm(t('groups.chat.deleteTitle'), t('groups.chat.deleteBody'), () => {
      void deleteGroupChatMessage(orgId, threadId, message.id).catch(() => showAlert(t('groups.chat.deleteError')));
    });

  const actions: ChatMessageAction[] = optionsFor
    ? [
        ...(closedHint ? [] : (['reply'] as const)),
        'copy' as const,
        ...(optionsFor.authorUid !== uid ? (['report'] as const) : []),
        ...(optionsFor.authorUid === uid || canModerate ? (['delete'] as const) : []),
      ]
    : [];

  const pick = (action: ChatMessageAction) => {
    const message = optionsFor;
    setOptionsFor(null);
    if (!message) return;
    if (action === 'reply') setReplyTo(message);
    else if (action === 'copy') void copyText(message.body);
    else if (action === 'delete') confirmDelete(message);
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

  const reactFromSheet = (picked: GroupChatReaction) => {
    const message = optionsFor;
    setOptionsFor(null);
    if (message) react(message, picked);
  };

  return (
    <View className="flex-1" testID={`group-chat-${threadId}`}>
      <FlatList
        inverted
        data={rows}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-3 py-3"
        testID="group-chat-list"
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if ((watch.data ?? []).length >= count) setCount((c) => c + GROUP_CHAT_PAGE_SIZE);
        }}
        renderItem={({ item, index }) => (
          <ChatMessageRow
            message={item}
            layout={layout[index] ?? { newDay: false, firstOfRun: false }}
            uid={uid}
            onLongPress={setOptionsFor}
            onReact={react}
          />
        )}
        ListFooterComponent={
          <VStack gap={2} className="pb-2">
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
        <View
          className="px-4 py-2 border-t border-subtle"
          style={{ marginBottom: keyboardGap }}
          testID="group-chat-composer"
        >
          {replyTo ? (
            <HStack gap={2} align="center" className="pb-2" testID="group-chat-replying">
              <View className="flex-1">
                <ChatQuote authorUid={replyTo.authorUid} authorName={replyTo.authorName} body={replyTo.body} uid={uid} />
              </View>
              <Pressable
                testID="group-chat-reply-cancel"
                accessibilityRole="button"
                accessibilityLabel={t('groups.chat.cancelReply')}
                hitSlop={8}
                onPress={() => setReplyTo(null)}
              >
                <Ionicons name="close" size={iconSizes.md} color={colors.light.fg.muted} />
              </Pressable>
            </HStack>
          ) : null}
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
      <ChatMessageSheet
        message={optionsFor}
        myReaction={optionsFor?.reactions?.[uid]}
        actions={actions}
        onReact={reactFromSheet}
        onAction={pick}
        onClose={() => setOptionsFor(null)}
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
