import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Keyboard, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, router } from 'expo-router';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { Text } from '../primitives/Text';
import { Pressable } from '../primitives/Pressable';
import { Button } from '../primitives/Button';
import { Input } from '../primitives/Input';
import { Avatar } from '../primitives/Avatar';
import { DetailSectionHeading } from './DetailSectionHeading';
import { useAuth } from '../../lib/auth/useAuth';
import { useRegisterGate } from '../../lib/auth/RegisterGateContext';
import { useT } from '../../lib/i18n';
import {
  addComment,
  deleteComment,
  getComments,
  getReplies,
} from '@cultuvilla/shared/services/commentsService';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { DELETED_USER_UID } from '@cultuvilla/shared/models/user';
import { iconSizes, colors } from '@cultuvilla/shared/design-system';
import type { CommentData, EntityKind } from '@cultuvilla/shared/models';
import { openOwner } from '../../lib/entities/ownerRoute';
import { resolveCommentAuthor, type CommentAuthor } from '../../lib/comments/commentAuthors';
import { ReportSheet, type ReportTarget } from './ReportSheet';
import { getBlockedUserIds } from '@cultuvilla/shared/services/blockedUserService';
import { useDetailScroll } from '../../lib/keyboard/DetailScrollContext';

export type EntityCommentsProps = {
  entityKind: EntityKind;
  entityId: string;
  municipalityId: string;
  /** true if the current user administers this entity's village (village-admin/app-admin) */
  canModerate?: boolean;
};

type CommentDoc = CommentData & { id: string };

function initialsOf(name: string | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || '+';
}

/**
 * An author's name arrives one round-trip after their comment does. Showing the
 * anonymous fallback in that window made real, named people flash as "Usuario",
 * so the pending state is a placeholder bar instead — the name that lands is
 * always the author's own.
 */
function AuthorName({ name, testID }: { name: string | undefined; testID: string }) {
  if (name === undefined) {
    return <View className="bg-subtle rounded-sm" style={{ height: 12, width: 96 }} testID={testID} />;
  }
  return (
    <Text className="font-bold flex-shrink" numberOfLines={1}>
      {name}
    </Text>
  );
}

/**
 * Makes an author's avatar/name open their profile. A comment left by an
 * account that has since been deleted keeps its text but points at a tombstone
 * uid, so it stays inert rather than routing to a screen that can't resolve.
 */
function AuthorLink({
  uid,
  label,
  testID,
  children,
}: {
  uid: string;
  label: string;
  testID: string;
  children: ReactNode;
}) {
  if (uid === DELETED_USER_UID) return <>{children}</>;
  return (
    <Pressable
      onPress={() => void openOwner('user', uid)}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/**
 * Instagram-style composer affordance: no button at rest, a send arrow inside
 * the field as soon as there is something to send.
 */
function SendAdornment({
  visible,
  sending,
  onPress,
  label,
  testID,
}: {
  visible: boolean;
  sending: boolean;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  if (!visible) return null;
  if (sending) return <ActivityIndicator size="small" />;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
      <Ionicons name="arrow-up-circle" size={iconSizes.lg} color={colors.light.bg.accent} />
    </Pressable>
  );
}

export function EntityComments({
  entityKind,
  entityId,
  municipalityId,
  canModerate = false,
}: EntityCommentsProps) {
  const { user } = useAuth();
  const gate = useRegisterGate();
  const { t } = useT();
  const pathname = usePathname();
  const [comments, setComments] = useState<CommentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [authors, setAuthors] = useState<Map<string, CommentAuthor>>(new Map());
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [repliesByParent, setRepliesByParent] = useState<Map<string, CommentDoc[]>>(new Map());
  const [loadingReplies, setLoadingReplies] = useState<Set<string>>(new Set());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const detailScrollRef = useDetailScroll();
  const revealComposer = () => detailScrollRef?.current?.scrollToEnd({ animated: true });

  const me = user ? authors.get(user.uid) : undefined;
  const visibleComments = comments.filter((c) => !blockedUserIds.has(c.authorUserId));
  const replyTarget = replyingTo ? comments.find((c) => c.id === replyingTo) : undefined;
  const replyTargetName = replyTarget ? authors.get(replyTarget.authorUserId)?.name : undefined;

  useEffect(() => {
    setLoading(true);
    void (async () => {
      setComments(await getComments(entityKind, entityId));
      setLoading(false);
    })();
  }, [entityKind, entityId]);

  // Blocking is client-side suppression: the blocked author's comments stay in
  // Firestore (their own screens are unaffected) and are filtered out here.
  useEffect(() => {
    if (!user) {
      setBlockedUserIds(new Set());
      return;
    }
    void getBlockedUserIds(user.uid).then((ids) => setBlockedUserIds(new Set(ids)));
  }, [user]);

  // The composer sits at the very bottom of the detail scroll, so an opening
  // keyboard lands right on top of it. The scaffold shrinks the scroll area
  // (KeyboardAvoidingView); scrolling to the end is what actually puts the
  // field — and the reply banner above it — back in front of the typist.
  useEffect(() => {
    if (!composerFocused) return;
    const sub = Keyboard.addListener('keyboardDidShow', revealComposer);
    // Focusing while the keyboard is already up (tapping "responder") fires no
    // keyboard event, so reveal once on focus too.
    revealComposer();
    return () => sub.remove();
    // revealComposer only reads a ref — re-subscribing per render would churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerFocused]);

  // A growing field pushes its own bottom edge under the keyboard; follow it.
  useEffect(() => {
    if (!composerFocused) return;
    revealComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, composerFocused]);

  // Resolve author name + photo once per uid (avoid an N+1 refetch per comment).
  useEffect(() => {
    const replyAuthorIds = [...repliesByParent.values()].flat().map((r) => r.authorUserId);
    // The signed-in user is resolved too — the composer shows their avatar.
    const unresolved = [
      ...new Set([...comments.map((c) => c.authorUserId), ...replyAuthorIds, ...(user ? [user.uid] : [])]),
    ].filter((uid) => !authors.has(uid));
    if (unresolved.length === 0) return;
    const labels = { deleted: t('settings.deletedUser'), fallback: t('comments.anonymousAuthor') };
    void (async () => {
      // resolveCommentAuthor never rejects, so one unreadable author cannot cost
      // everyone else on screen their name.
      const entries = await Promise.all(
        unresolved.map(async (uid) => [uid, await resolveCommentAuthor(uid, labels)] as const),
      );
      setAuthors((prev) => {
        const next = new Map(prev);
        for (const [uid, author] of entries) next.set(uid, author);
        return next;
      });
    })();
    // authors is read but intentionally excluded — it's the accumulator this
    // effect writes to; including it would re-run on every resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, repliesByParent, user, t]);

  const runDeleteConfirm = (onConfirm: () => void) => {
    Alert.alert(t('comments.deleteConfirmTitle'), t('comments.deleteConfirmMessage'), [
      { text: t('comments.deleteConfirmCancel'), style: 'cancel' },
      { text: t('comments.deleteConfirmConfirm'), style: 'destructive', onPress: onConfirm },
    ]);
  };

  const onDelete = (commentId: string) => {
    runDeleteConfirm(() => {
      const parentId = [...repliesByParent.entries()].find(([, replies]) =>
        replies.some((r) => r.id === commentId),
      )?.[0];
      setComments((prev) =>
        prev
          .filter((c) => c.id !== commentId)
          .map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount - 1 } : c)),
      );
      if (parentId) {
        setRepliesByParent((prev) => {
          const next = new Map(prev);
          next.set(parentId, (prev.get(parentId) ?? []).filter((r) => r.id !== commentId));
          return next;
        });
      }
      void deleteComment(commentId);
    });
  };

  /** Reporting is only offered on somebody else's words, and only to a signed-in
   *  person — a report needs an accountable reporter. */
  const canReport = (authorUserId: string) =>
    !!user && authorUserId !== user.uid && authorUserId !== DELETED_USER_UID;

  const openReport = (commentId: string, authorUserId: string) =>
    setReportTarget({
      kind: 'comment',
      id: commentId,
      municipalityId,
      authorUserId,
    });

  const onBlocked = (blockedUserId: string) =>
    setBlockedUserIds((prev) => new Set(prev).add(blockedUserId));

  const onToggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
        return next;
      }
      next.add(commentId);
      if (!repliesByParent.has(commentId)) void loadReplies(commentId);
      return next;
    });
  };

  const loadReplies = async (commentId: string) => {
    setLoadingReplies((p) => new Set(p).add(commentId));
    try {
      const replies = await getReplies(entityKind, entityId, commentId);
      setRepliesByParent((prev) => new Map(prev).set(commentId, replies));
    } finally {
      setLoadingReplies((p) => {
        const next = new Set(p);
        next.delete(commentId);
        return next;
      });
    }
  };

  const onStartReply = (commentId: string) => {
    setReplyingTo(commentId);
    inputRef.current?.focus();
  };

  /**
   * One composer for both cases: `replyingTo` decides whether what you type
   * lands as a top-level comment or as a reply to the comment named above the
   * field.
   */
  const onSend = () => {
    if (!user) {
      gate.requireAuth(pathname, t('guest.comment'));
      return;
    }
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    const parentCommentId = replyingTo;
    setSending(true);
    void (async () => {
      try {
        const id = await addComment({
          entityKind,
          entityId,
          municipalityId,
          authorUserId: user.uid,
          body: trimmed,
          ...(parentCommentId ? { parentCommentId } : {}),
        });
        const posted: CommentDoc = {
          id, entityKind, entityId, municipalityId, authorUserId: user.uid, body: trimmed,
          createdAt: new Date(), parentCommentId, replyCount: 0,
        };
        if (parentCommentId) {
          setComments((prev) =>
            prev.map((c) => (c.id === parentCommentId ? { ...c, replyCount: c.replyCount + 1 } : c)),
          );
          setExpandedReplies((prev) => new Set(prev).add(parentCommentId));
          // Appending to a thread we never fetched would render the new reply
          // as if it were the whole thread — fetch it instead.
          if (repliesByParent.has(parentCommentId)) {
            setRepliesByParent((prev) =>
              new Map(prev).set(parentCommentId, [...(prev.get(parentCommentId) ?? []), posted]),
            );
          } else {
            void loadReplies(parentCommentId);
          }
        } else {
          setComments((prev) => [...prev, posted]);
        }
        setReplyingTo(null);
        setBody('');
      } finally {
        setSending(false);
      }
    })();
  };

  return (
    <VStack gap={3}>
      <DetailSectionHeading>{t('comments.sectionTitle')}</DetailSectionHeading>
      {loading ? (
        <View className="items-center py-4">
          <ActivityIndicator />
        </View>
      ) : visibleComments.length === 0 ? null : (
        <VStack gap={3}>
          {visibleComments.map((comment) => {
            const canDelete = comment.authorUserId === user?.uid || canModerate;
            const author = authors.get(comment.authorUserId);
            const name = author?.name;
            return (
              <VStack key={comment.id} gap={1}>
                <HStack gap={2} align="start" justify="between">
                  <AuthorLink
                    uid={comment.authorUserId}
                    label={name ?? ''}
                    testID={`comment-author-avatar-${comment.id}`}
                  >
                    <Avatar uri={author?.photoURL ?? null} size={36} initials={initialsOf(name)} />
                  </AuthorLink>
                  <VStack gap={1} className="flex-1">
                    {/* Instagram-style header: name with the age of the comment
                        beside it, the body on its own line underneath. */}
                    <HStack gap={2} align="center">
                      <AuthorLink
                        uid={comment.authorUserId}
                        label={name ?? ''}
                        testID={`comment-author-${comment.id}`}
                      >
                        <AuthorName name={name} testID={`comment-author-pending-${comment.id}`} />
                      </AuthorLink>
                      <Text variant="caption" tone="muted">
                        {formatCompactRelativeTime(comment.createdAt)}
                      </Text>
                    </HStack>
                    <Text>{comment.body}</Text>
                    <HStack gap={4}>
                      {comment.replyCount > 0 ? (
                        <Pressable onPress={() => onToggleReplies(comment.id)}>
                          <Text variant="caption" tone="muted">
                            {expandedReplies.has(comment.id)
                              ? t('comments.hideReplies')
                              : t('comments.viewReplies', { count: comment.replyCount })}
                          </Text>
                        </Pressable>
                      ) : null}
                      {user ? (
                        <Pressable onPress={() => onStartReply(comment.id)}>
                          <Text variant="caption" tone="muted">{t('comments.reply')}</Text>
                        </Pressable>
                      ) : null}
                    </HStack>
                  </VStack>
                  {canDelete ? (
                    <Pressable
                      onPress={() => onDelete(comment.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('comments.delete')}
                      className="p-1"
                    >
                      <Ionicons name="trash-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
                    </Pressable>
                  ) : null}
                  {canReport(comment.authorUserId) ? (
                    <Pressable
                      onPress={() => openReport(comment.id, comment.authorUserId)}
                      accessibilityRole="button"
                      accessibilityLabel={t('report.title')}
                      testID={`comment-report-${comment.id}`}
                      className="p-1"
                    >
                      <Ionicons name="flag-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
                    </Pressable>
                  ) : null}
                </HStack>

                {expandedReplies.has(comment.id) ? (
                  loadingReplies.has(comment.id) ? (
                    <View className="pl-10 py-2">
                      <ActivityIndicator size="small" />
                    </View>
                  ) : (
                    <VStack gap={2} className="pl-10">
                      {(repliesByParent.get(comment.id) ?? [])
                        .filter((reply) => !blockedUserIds.has(reply.authorUserId))
                        .map((reply) => {
                        const replyAuthor = authors.get(reply.authorUserId);
                        const replyName = replyAuthor?.name;
                        const canDeleteReply = reply.authorUserId === user?.uid || canModerate;
                        return (
                          <HStack key={reply.id} gap={2} align="start" justify="between">
                            <AuthorLink
                              uid={reply.authorUserId}
                              label={replyName ?? ''}
                              testID={`comment-author-avatar-${reply.id}`}
                            >
                              <Avatar uri={replyAuthor?.photoURL ?? null} size={28} initials={initialsOf(replyName)} />
                            </AuthorLink>
                            <VStack gap={1} className="flex-1">
                              <HStack gap={2} align="center">
                                <AuthorLink
                                  uid={reply.authorUserId}
                                  label={replyName ?? ''}
                                  testID={`comment-author-${reply.id}`}
                                >
                                  <AuthorName
                                    name={replyName}
                                    testID={`comment-author-pending-${reply.id}`}
                                  />
                                </AuthorLink>
                                <Text variant="caption" tone="muted">
                                  {formatCompactRelativeTime(reply.createdAt)}
                                </Text>
                              </HStack>
                              <Text>{reply.body}</Text>
                            </VStack>
                            {canDeleteReply ? (
                              <Pressable
                                onPress={() => onDelete(reply.id)}
                                accessibilityRole="button"
                                accessibilityLabel={t('comments.delete')}
                                className="p-1"
                              >
                                <Ionicons name="trash-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
                              </Pressable>
                            ) : null}
                            {canReport(reply.authorUserId) ? (
                              <Pressable
                                onPress={() => openReport(reply.id, reply.authorUserId)}
                                accessibilityRole="button"
                                accessibilityLabel={t('report.title')}
                                testID={`comment-report-${reply.id}`}
                                className="p-1"
                              >
                                <Ionicons name="flag-outline" size={iconSizes.sm} color={colors.light.fg.muted} />
                              </Pressable>
                            ) : null}
                          </HStack>
                        );
                      })}
                    </VStack>
                  )
                ) : null}
              </VStack>
            );
          })}
        </VStack>
      )}
      {user ? (
        <VStack gap={1}>
          {replyTarget ? (
            <HStack gap={2} align="center" justify="between" className="pl-10">
              <Text variant="caption" tone="muted" numberOfLines={1} className="flex-shrink">
                {t('comments.replyingTo', { name: replyTargetName ?? '' })}
              </Text>
              <Pressable
                onPress={() => setReplyingTo(null)}
                accessibilityRole="button"
                accessibilityLabel={t('comments.cancelReply')}
                testID="comment-reply-cancel"
              >
                <Ionicons name="close" size={iconSizes.sm} color={colors.light.fg.muted} />
              </Pressable>
            </HStack>
          ) : null}
          {/* end-aligned so the avatar and send arrow stay level with the last
              line as the field grows; mb-1 centres the 32px avatar on the
              one-line pill (~40px) instead of hugging its bottom edge. */}
          <HStack gap={2} align="end">
            <View className="mb-1">
              <Avatar
                uri={me?.photoURL ?? null}
                size={32}
                initials={initialsOf(me?.name)}
              />
            </View>
            <View className="flex-1">
              <Input
                inputRef={inputRef}
                value={body}
                onChangeText={setBody}
                placeholder={
                  replyTarget ? t('comments.replyPlaceholder') : t('comments.placeholder')
                }
                accessibilityLabel={t('comments.placeholder')}
                testID="comment-input"
                pill
                autoGrow
                onFocus={() => setComposerFocused(true)}
                onBlur={() => setComposerFocused(false)}
                rightAdornment={
                  <SendAdornment
                    visible={body.trim().length > 0}
                    sending={sending}
                    onPress={onSend}
                    label={t('comments.send')}
                    testID="comment-send"
                  />
                }
              />
            </View>
          </HStack>
        </VStack>
      ) : (
        <Button variant="secondary" onPress={() => gate.requireAuth(pathname, t('guest.comment'))}>
          {t('comments.signInToComment')}
        </Button>
      )}
      {user ? (
        <ReportSheet
          visible={reportTarget !== null}
          target={reportTarget}
          reporterUserId={user.uid}
          onClose={() => setReportTarget(null)}
          onBlocked={onBlocked}
        />
      ) : null}
    </VStack>
  );
}
