import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
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
import { useComposerKeyboardGap } from '../../../../lib/keyboard/useKeyboardOpen';

/**
 * A request's chat, filling its screen: where its requester and the cosa's
 * manager arrange the handover without sharing a phone. `head` (what was
 * asked) scrolls on top of the messages, oldest first; `footer` (the next
 * step's buttons) stays pinned above the composer, which shows while the chat
 * is open. Messages from people the viewer blocked are hidden; each message
 * offers the delete and the report it may.
 */
export function CosaRequestChat({
  requestId,
  municipalityId,
  uid,
  canModerate,
  open,
  head,
  footer,
}: {
  requestId: string;
  municipalityId: string;
  uid: string;
  /** An admin of the request's group: may delete anyone's message. */
  canModerate: boolean;
  /** False once the request ended COSA_CHAT_CLOSE_DAYS ago: readable, no composer. */
  open: boolean;
  head?: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useT();
  const scrollRef = useRef<ScrollView>(null);
  const keyboardGap = useComposerKeyboardGap();
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

  // Keep the newest message in view: when one arrives, and while typing with the keyboard up.
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [rows.length]);
  useEffect(() => {
    if (!focused) return;
    const reveal = () => scrollRef.current?.scrollToEnd({ animated: true });
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    reveal();
    return () => sub.remove();
  }, [focused]);

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
    <View className="flex-1" testID="cosa-request-chat">
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerClassName="px-4 pt-4 pb-4 gap-3" keyboardShouldPersistTaps="handled">
        {head}
        <DetailSectionHeading>{t('groups.cosateca.chat.title')}</DetailSectionHeading>
        {loaded.length >= count ? (
          <Button variant="secondary" size="md" onPress={() => setCount((c) => c + GROUP_CHAT_PAGE_SIZE)} testID="cosa-request-chat-older">
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
        {rows.map((m) => {
          const mine = m.authorUid === uid;
          return (
            <HStack key={m.id} gap={1} align="start" className={`max-w-[85%] ${mine ? 'self-end' : 'self-start'}`} testID={`cosa-request-chat-message-${m.id}`}>
              <VStack gap={1} className={`rounded-2xl px-3 py-2 flex-shrink ${mine ? 'bg-accent-subtle/40' : 'bg-surface-elevated'}`}>
                <HStack gap={2} align="center">
                  <Text variant="caption" className="font-bold flex-shrink" numberOfLines={1}>
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
          );
        })}
      </ScrollView>
      <View className="px-4 pt-2 pb-2 gap-2 border-t border-subtle bg-surface" style={{ marginBottom: keyboardGap }}>
        {footer}
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
          <Text tone="muted" variant="bodySm" className="text-center py-1" testID="cosa-request-chat-closed">
            {t('groups.cosateca.chat.closed')}
          </Text>
        )}
      </View>
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
    </View>
  );
}
