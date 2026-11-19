import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Screen, VStack, HStack, Text, Button } from '../primitives';
import { ScreenHeader } from '../layout/ScreenHeader';
import { LiveOwnerChip } from './LiveOwnerChip';
import { useT } from '../../lib/i18n';
import {
  getOpenReports,
  getReportsByMunicipality,
  setReportStatus,
  type ContentReport,
} from '@cultuvilla/shared/services/contentReportService';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { deleteComment, getComment } from '@cultuvilla/shared/services/commentsService';
import { deleteGroupChatMessage } from '@cultuvilla/shared/services/groupChatService';
import { deleteCosaRequestChatMessage } from '@cultuvilla/shared/services/cosatecaService';
import { parseGroupChatMessagePath } from '@cultuvilla/shared/models/organization/GroupChatDataModel';
import { parseCosaRequestChatMessagePath } from '@cultuvilla/shared/models/organization/CosaRequestDataModel';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { showAlert, showConfirm } from '../../lib/dialogs';
import { useAuth } from '../../lib/auth/useAuth';

/** One village's queue (its team), or every village's (app admins). */
export type ReportsScope = { municipalityId: string } | { allVillages: true };

/** `null` is every village. */
async function loadReports(municipalityId: string | null): Promise<ContentReport[]> {
  if (municipalityId) return getReportsByMunicipality(municipalityId, { status: 'open' });
  const reports = await getOpenReports();
  return reports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

async function villageNames(reports: ContentReport[]): Promise<Map<string, string>> {
  const ids = [...new Set(reports.map((r) => r.municipalityId))];
  const entries = await Promise.all(
    ids.map(async (id) => [id, (await getMunicipality(id).catch(() => null))?.name ?? null] as const),
  );
  return new Map(entries.filter((e): e is readonly [string, string] => e[1] !== null));
}

/**
 * A reported chat message — a group chat's or a cosa request's — as the delete
 * that removes it, or null for a report of anything else.
 */
function reportedChatMessageDelete(targetId: string): (() => Promise<void>) | null {
  const group = parseGroupChatMessagePath(targetId);
  if (group) return () => deleteGroupChatMessage(group.orgId, group.threadId, group.chatId);
  const cosa = parseCosaRequestChatMessagePath(targetId);
  if (cosa) return () => deleteCosaRequestChatMessage(cosa.requestId, cosa.chatId);
  return null;
}

/**
 * Moderator inbox for user-filed reports. Filing a report is worthless if nobody
 * can see the queue — this is the other half of the reporting path both stores
 * require. Across every village, each row names its pueblo.
 */
export function ContentReportsInbox(scope: ReportsScope) {
  const { t } = useT();
  const { user } = useAuth();
  const [rows, setRows] = useState<ContentReport[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busyId, setBusyId] = useState<string | null>(null);
  const municipalityId = 'municipalityId' in scope ? scope.municipalityId : null;
  const allVillages = municipalityId === null;

  const load = useCallback(async () => {
    const reports = await loadReports(municipalityId);
    setRows(reports);
    if (!municipalityId) setNames(await villageNames(reports));
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
    const remove = reportedChatMessageDelete(report.targetId);
    if (!remove) return;
    showConfirm(
      t('admin.reports.confirmDeleteMessageTitle'),
      report.targetText ?? '',
      () =>
        removeTarget(
          report,
          remove,
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
      {rows === null ? (
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
          renderItem={({ item }) => {
            // Nobody moderates their own content; the rules refuse it too.
            const ownContent = !!user && item.targetAuthorUserId === user.uid;
            const villageName = allVillages ? names.get(item.municipalityId) : undefined;
            return (
              <VStack gap={2} className="bg-surface border border-subtle rounded-xl p-3">
                {villageName ? (
                  <Text variant="caption" className="font-bold" testID={`admin-report-village-${item.id}`}>
                    {villageName}
                  </Text>
                ) : null}
                <HStack justify="between" align="center">
                  <Text className="font-bold">{t(`report.reason.${item.reason}`)}</Text>
                  <Text variant="caption" tone="muted">
                    {formatCompactRelativeTime(item.createdAt)}
                  </Text>
                </HStack>
                <Text variant="caption" tone="muted">
                  {t(`admin.reports.kind.${reportedChatMessageDelete(item.targetId) ? 'chatMessage' : item.targetKind}`)}
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
                {ownContent ? (
                  <Text variant="caption" tone="muted" testID={`admin-report-own-${item.id}`}>
                    {t('admin.reports.ownContent')}
                  </Text>
                ) : null}
                {!ownContent && item.targetKind === 'comment' ? (
                  <Button
                    variant="secondary"
                    disabled={busyId === item.id}
                    onPress={() =>
                      reportedChatMessageDelete(item.targetId)
                        ? deleteReportedMessage(item)
                        : void deleteReportedComment(item)
                    }
                    testID={`admin-report-delete-${item.id}`}
                  >
                    {t(reportedChatMessageDelete(item.targetId) ? 'admin.reports.deleteMessage' : 'admin.reports.deleteComment')}
                  </Button>
                ) : null}
                {ownContent ? null : (
                  <HStack gap={2}>
                    <Button
                      variant="secondary"
                      disabled={busyId === item.id}
                      onPress={() => void resolve(item, 'dismissed')}
                      testID={`admin-report-dismiss-${item.id}`}
                    >
                      {t('admin.reports.dismiss')}
                    </Button>
                    <Button
                      disabled={busyId === item.id}
                      onPress={() => void resolve(item, 'reviewed')}
                      testID={`admin-report-reviewed-${item.id}`}
                    >
                      {t('admin.reports.markReviewed')}
                    </Button>
                  </HStack>
                )}
              </VStack>
            );
          }}
        />
      )}
    </Screen>
  );
}
