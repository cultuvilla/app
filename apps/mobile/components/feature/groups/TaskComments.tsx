import { useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { GROUP_CHAT_PAGE_SIZE } from '@cultuvilla/shared/models/organization';
import { addTaskComment, deleteTaskComment, watchTaskComments, type TaskComment } from '@cultuvilla/shared/services/groupTaskService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { Avatar, Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useDetailScroll } from '../../../lib/keyboard/DetailScrollContext';
import { useMemberFaces } from '../../../lib/orgs/useOrgMembers';

const AVATAR_SIZE = 32;

/**
 * A task's comments, private to the group: the list, oldest on top, and the
 * composer under it. Authors delete their own; admins anyone's.
 */
export function TaskComments({ orgId, taskId, uid, isAdmin }: { orgId: string; taskId: string; uid: string; isAdmin: boolean }) {
  const { t } = useT();
  const scrollRef = useDetailScroll();
  const [count, setCount] = useState(GROUP_CHAT_PAGE_SIZE);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);
  const comments = useWatch<TaskComment[]>('groups:watchTaskComments', `${orgId}|${taskId}|${String(count)}`, (next, error) =>
    watchTaskComments(orgId, taskId, count, next, error),
  );
  const rows = useMemo(() => [...(comments.data ?? [])].reverse(), [comments.data]);
  const faces = useMemberFaces(useMemo(() => rows.map((c) => c.authorUid), [rows]));
  const fail = () => showAlert(t('groups.tasks.comments.error'));

  // The composer closes the page, so an opening keyboard or a growing field lands
  // on top of it: keep the end of the page in view while typing.
  useEffect(() => {
    if (!focused) return;
    const reveal = () => scrollRef?.current?.scrollToEnd({ animated: true });
    const sub = Keyboard.addListener('keyboardDidShow', reveal);
    reveal();
    return () => sub.remove();
  }, [focused, body, scrollRef]);

  const send = () => {
    setSending(true);
    getPublicProfile(uid)
      .then((profile) => addTaskComment({ orgId, taskId, uid, authorName: profile?.displayName ?? '', body }))
      .then(() => setBody(''))
      .catch(fail)
      .finally(() => setSending(false));
  };

  const remove = (comment: TaskComment) =>
    showConfirm(
      t('groups.tasks.comments.delete'),
      t('groups.tasks.comments.deleteConfirm'),
      () => void deleteTaskComment(orgId, taskId, comment.id).catch(fail),
      { confirmText: t('common.delete'), cancelText: t('common.cancel') },
    );

  return (
    <VStack gap={3} testID="task-comments">
      <DetailSectionHeading>{t('groups.tasks.comments.title')}</DetailSectionHeading>
      {rows.length >= count ? (
        <Button variant="ghost" onPress={() => setCount((c) => c + GROUP_CHAT_PAGE_SIZE)} testID="task-comments-older">
          {t('groups.tasks.comments.older')}
        </Button>
      ) : null}
      {comments.status === 'ready' && rows.length === 0 ? (
        <Text tone="muted" testID="task-comments-empty">
          {t('groups.tasks.comments.empty')}
        </Text>
      ) : null}
      {rows.map((c) => (
        <HStack key={c.id} gap={2} align="start" testID={`task-comment-${c.id}`}>
          <Avatar uri={faces[c.authorUid]?.photoURL ?? null} size={AVATAR_SIZE} initials={c.authorName.charAt(0).toUpperCase()} />
          <VStack gap={1} className="flex-1">
            <HStack gap={2} align="center">
              <Text className="font-bold flex-shrink" numberOfLines={1}>
                {c.authorName}
              </Text>
              <Text variant="caption" tone="muted">
                {formatCompactRelativeTime(c.createdAt)}
              </Text>
            </HStack>
            <Text selectable>{c.body}</Text>
          </VStack>
          {isAdmin || c.authorUid === uid ? (
            <Pressable
              onPress={() => remove(c)}
              accessibilityRole="button"
              accessibilityLabel={t('groups.tasks.comments.delete')}
              testID={`task-comment-delete-${c.id}`}
            >
              <Ionicons name="trash-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
            </Pressable>
          ) : null}
        </HStack>
      ))}
      <Input
        value={body}
        onChangeText={setBody}
        placeholder={t('groups.tasks.comments.placeholder')}
        accessibilityLabel={t('groups.tasks.comments.placeholder')}
        testID="task-comment-input"
        pill
        autoGrow
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rightAdornment={
          body.trim().length > 0 && !sending ? (
            <Pressable
              onPress={send}
              accessibilityRole="button"
              accessibilityLabel={t('groups.tasks.comments.send')}
              testID="task-comment-send"
            >
              <Ionicons name="arrow-up-circle" size={iconSizes.lg} color={colors.light.bg.accent} />
            </Pressable>
          ) : null
        }
      />
    </VStack>
  );
}
