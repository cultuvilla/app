import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Screen, VStack, HStack, Text, Button } from '../primitives';
import { ScreenHeader } from '../layout/ScreenHeader';
import { LiveOwnerChip } from './LiveOwnerChip';
import { useT } from '../../lib/i18n';
import {
  getReportsByMunicipality,
  setReportStatus,
  type ContentReport,
} from '@cultuvilla/shared/services/contentReportService';
import { deleteComment, getComment } from '@cultuvilla/shared/services/commentsService';
import { deleteGroupChatMessage } from '@cultuvilla/shared/services/groupChatService';
import { parseGroupChatMessagePath } from '@cultuvilla/shared/models/organization/GroupChatDataModel';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { showAlert, showConfirm } from '../../lib/dialogs';

/**
 * Moderator inbox for user-filed reports, scoped to one village. Filing a report
 * is worthless if nobody can see the queue — this is the other half of the
 * reporting path both stores require.
 */
export function ContentReportsInbox({ municipalityId }: { municipalityId: string | null }) {
  const { t } = useT();
  const [rows, setRows] = useState<ContentReport[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!municipalityId) {
      setRows([]);
      return;
    }
    setRows(await getReportsByMunicipality(municipalityId, { status: 'open' }));
  }, [municipalityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(report: ContentReport, status: 'reviewed' | 'dismissed') {
    setBusyId(report.id);
    try {
      await setReportStatus(report.id, status);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function removeTarget(report: ContentReport, remove: () => Promise<void>, errorKey: string) {
    setBusyId(report.id);
    remove()
      .then(() => setReportStatus(report.id, 'reviewed'))
      .then(load)
      .catch(() => showAlert(t(errorKey)))
      .finally(() => setBusyId(null));
  }

  // A chat is closed to its moderators, so this is the only place they can act on
  // a message. The words shown are the reporter's copy, hence the confirm quoting them.
  function deleteReportedMessage(report: ContentReport) {
    const target = parseGroupChatMessagePath(report.targetId);
    if (!target) return;
    showConfirm(
      t('admin.reports.confirmDeleteMessageTitle'),
      report.targetText ?? '',
      () =>
        removeTarget(
          report,
          () => deleteGroupChatMessage(target.orgId, target.threadId, target.chatId),
          'admin.reports.deleteMessageError',
        ),
      { confirmText: t('admin.reports.deleteMessage') },
    );
  }

  // The reporter's app supplies both the quote and the id, so the confirm shows the
  // comment that would actually go, read from the source.
  async function deleteReportedComment(report: ContentReport) {
    setBusyId(report.id);
    const comment = await getComment(report.targetId)
      .catch(() => null)
      .finally(() => setBusyId(null));
    if (comment?.municipalityId !== report.municipalityId) {
      showAlert(t('admin.reports.deleteCommentError'));
      return;
    }
    showConfirm(
      t('admin.reports.confirmDeleteCommentTitle'),
      comment.body,
      () => removeTarget(report, () => deleteComment(comment.id), 'admin.reports.deleteCommentError'),
      { confirmText: t('admin.reports.deleteComment') },
    );
  }

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('admin.reports.title')} />
      {!municipalityId ? (
        <View className="p-4">
          <Text>{t('admin.reports.noVillage')}</Text>
        </View>
      ) : rows === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : rows.length === 0 ? (
        <View className="p-4">
          <Text>{t('admin.reports.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <VStack gap={2} className="bg-surface border border-subtle rounded-xl p-3">
              <HStack justify="between" align="center">
                <Text className="font-bold">{t(`report.reason.${item.reason}`)}</Text>
                <Text variant="caption" tone="muted">
                  {formatCompactRelativeTime(item.createdAt)}
                </Text>
              </HStack>
              <Text variant="caption" tone="muted">
                {t(`admin.reports.kind.${parseGroupChatMessagePath(item.targetId) ? 'chatMessage' : item.targetKind}`)}
              </Text>
              {item.targetAuthorUserId ? (
                <LiveOwnerChip
                  ownerId={item.targetAuthorUserId}
                  ownerType="user"
                  fallbackName={item.targetAuthorUserId}
                  size={32}
                />
              ) : null}
              {item.targetText ? (
                <Text selectable testID={`admin-report-text-${item.id}`}>
                  {item.targetText}
                </Text>
              ) : null}
              {item.note ? <Text>{item.note}</Text> : null}
              {item.targetKind === 'comment' ? (
                <Button
                  variant="secondary"
                  disabled={busyId === item.id}
                  onPress={() =>
                    parseGroupChatMessagePath(item.targetId)
                      ? deleteReportedMessage(item)
                      : void deleteReportedComment(item)
                  }
                  testID={`admin-report-delete-${item.id}`}
                >
                  {t(parseGroupChatMessagePath(item.targetId) ? 'admin.reports.deleteMessage' : 'admin.reports.deleteComment')}
                </Button>
              ) : null}
              <HStack gap={2}>
                <Button
                  variant="secondary"
                  disabled={busyId === item.id}
                  onPress={() => void resolve(item, 'dismissed')}
                >
                  {t('admin.reports.dismiss')}
                </Button>
                <Button
                  disabled={busyId === item.id}
                  onPress={() => void resolve(item, 'reviewed')}
                >
                  {t('admin.reports.markReviewed')}
                </Button>
              </HStack>
            </VStack>
          )}
        />
      )}
    </Screen>
  );
}
