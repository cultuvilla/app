import { useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { GROUP_CHAT_PAGE_SIZE, cosaRequestChatMessagePath } from '@cultuvilla/shared/models/organization';
import { getBlockedUserIds } from '@cultuvilla/shared/services/blockedUserService';
import {
  deleteCosaRequestChatMessage,
  sendCosaRequestChatMessage,
  watchCosaRequestChat,
  type CosaRequestChatMessage,
} from '@cultuvilla/shared/services/cosatecaService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { DetailSectionHeading } from '../../DetailSectionHeading';
import { ReportSheet, type ReportTarget } from '../../ReportSheet';
import { OptionsSheet } from '../OptionsSheet';
import { Button, HStack, Input, Pressable, Text, VStack } from '../../../primitives';
import { showAlert, showConfirm } from '../../../../lib/dialogs';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { useDetailScroll } from '../../../../lib/keyboard/DetailScrollContext';

/**
 * A request's chat, under the request: where its requester and the cosa's
 * manager arrange the handover without sharing a phone. Oldest on top, the
 * composer under it while the chat is open. Messages from people the viewer blocked are hidden; each
 * message offers the delete and the report it may.
 */
export function CosaRequestChat({
  requestId,
  municipalityId,
  uid,
  canModerate,
  open,
}: {
  requestId: string;
  municipalityId: string;
  uid: string;
  /** An admin of the request's group: may delete anyone's message. */
  canModerate: boolean;
  /** False once the request ended COSA_CHAT_CLOSE_DAYS ago: readable, no composer. */
  open: boolean;
}) {
  const { t } = useT();
  const scrollRef = useDetailScroll();
  const [count, setCount] = useState(GROUP_CHAT_PAGE_SIZE);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [optionsFor, setOptionsFor] = useState<CosaRequestChatMessage | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);

  const watch = useWatch<CosaRequestChatMessage[]>('cosateca:watchCosaRequestChat', `${requestId}|${String(count)}`, (next, error) =>
    watchCosaRequestChat(requestId, count, next, error),
  );
  const loaded = watch.data ?? [];
  const rows = useMemo(() => [...loaded].reverse().filter((m) => !blocked.has(m.authorUid)), [loaded, blocked]);

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

  // The composer closes the page, so an opening keyboard lands on top of it:
  // keep the end of the page in view while typing.
  useEffect(() => {
    if (!focused) return;
    const reveal = () => scrollRef?.current?.scrollToEnd({ animated: true });
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    reveal();
    return () => sub.remove();
  }, [focused, body, scrollRef]);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    getPublicProfile(uid)
      .then((profile) => sendCosaRequestChatMessage({ requestId, uid, authorName: profile?.displayName ?? '', body: text }))
      .then(() => setBody(''))
      .catch(() => showAlert(t('groups.cosateca.chat.sendError')))
      .finally(() => setSending(false));
  };

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
    if (key === 'delete') {
      showConfirm(t('groups.chat.deleteTitle'), t('groups.cosateca.chat.deleteBody'), () => {
        void deleteCosaRequestChatMessage(requestId, message.id).catch(() => showAlert(t('groups.chat.deleteError')));
      });
    } else {
      setReport({
        kind: 'comment',
        id: cosaRequestChatMessagePath(requestId, message.id),
        municipalityId,
        authorUserId: message.authorUid,
        text: message.body,
      });
    }
  };

  return (
    <VStack gap={3} testID="cosa-request-chat">
      <DetailSectionHeading>{t('groups.cosateca.chat.title')}</DetailSectionHeading>
      {loaded.length >= count ? (
        <Button variant="ghost" onPress={() => setCount((c) => c + GROUP_CHAT_PAGE_SIZE)} testID="cosa-request-chat-older">
          {t('groups.cosateca.chat.older')}
        </Button>
      ) : null}
      {watch.status === 'error' ? (
        <Text tone="danger" testID="cosa-request-chat-error">
          {t('groups.chat.loadError')}
        </Text>
      ) : watch.status === 'ready' && rows.length === 0 ? (
        <Text tone="muted" testID="cosa-request-chat-empty">
          {t('groups.cosateca.chat.empty')}
        </Text>
      ) : null}
      {rows.map((m) => (
        <HStack key={m.id} gap={2} align="start" testID={`cosa-request-chat-message-${m.id}`}>
          <VStack gap={1} className="flex-1">
            <HStack gap={2} align="center">
              <Text className="font-bold flex-shrink" numberOfLines={1}>
                {m.authorName}
              </Text>
              <Text variant="caption" tone="muted">
                {formatCompactRelativeTime(m.createdAt)}
              </Text>
            </HStack>
            <Text selectable>{m.body}</Text>
          </VStack>
          <Pressable
            onPress={() => setOptionsFor(m)}
            accessibilityRole="button"
            accessibilityLabel={t('groups.chat.options')}
            hitSlop={8}
            testID={`cosa-request-chat-options-${m.id}`}
          >
            <Ionicons name="ellipsis-vertical" size={iconSizes.sm} color={colors.light.fg.muted} />
          </Pressable>
        </HStack>
      ))}
      {open ? (
        <Input
          value={body}
          onChangeText={setBody}
          placeholder={t('groups.cosateca.chat.placeholder')}
          accessibilityLabel={t('groups.cosateca.chat.placeholder')}
          testID="cosa-request-chat-input"
          maxLength={2000}
          pill
          autoGrow
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rightAdornment={
            body.trim().length > 0 && !sending ? (
              <Pressable onPress={send} accessibilityRole="button" accessibilityLabel={t('groups.chat.send')} testID="cosa-request-chat-send">
                <Ionicons name="arrow-up-circle" size={iconSizes.lg} color={colors.light.bg.accent} />
              </Pressable>
            ) : null
          }
        />
      ) : (
        <Text tone="muted" testID="cosa-request-chat-closed">
          {t('groups.cosateca.chat.closed')}
        </Text>
      )}
      <OptionsSheet
        visible={optionsFor !== null}
        title={t('groups.chat.options')}
        options={options}
        onPick={pick}
        onClose={() => setOptionsFor(null)}
        testID="cosa-request-chat-options"
      />
      <ReportSheet
        visible={report !== null}
        target={report}
        reporterUserId={uid}
        onClose={() => setReport(null)}
        onBlocked={(id) => setBlocked((current) => new Set(current).add(id))}
      />
    </VStack>
  );
}
