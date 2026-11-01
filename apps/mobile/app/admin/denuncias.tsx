import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { Screen, VStack, HStack, Text, Button } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { LiveOwnerChip } from '../../components/feature/LiveOwnerChip';
import { useT } from '../../lib/i18n';
import { useActiveVillageId } from '../../lib/village/useActiveVillageId';
import {
  getReportsByMunicipality,
  setReportStatus,
  type ContentReport,
} from '@cultuvilla/shared/services/contentReportService';
import { deleteGroupChatMessage } from '@cultuvilla/shared/services/groupChatService';
import { parseGroupChatMessagePath } from '@cultuvilla/shared/models/organization/GroupChatDataModel';
import { formatCompactRelativeTime } from '@cultuvilla/shared/utils';
import { showAlert, showConfirm } from '../../lib/dialogs';

/**
 * Moderator inbox for user-filed reports, scoped to the active village. Filing
 * a report is worthless if nobody can see the queue — this is the other half of
 * the reporting path both stores require.
 */
export default function AdminReportsScreen() {
  const { t } = useT();
  const municipalityId = useActiveVillageId();
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

  // A chat is closed to its moderators, so this is the only place they can act on
  // a message. The words shown are the reporter's copy, hence the confirm quoting them.
  function deleteReportedMessage(report: ContentReport) {
    const target = parseGroupChatMessagePath(report.targetId);
    if (!target) return;
    showConfirm(
      t('admin.reports.confirmDeleteMessageTitle'),
      report.targetText ?? '',
      () => {
        setBusyId(report.id);
        deleteGroupChatMessage(target.orgId, target.threadId, target.chatId)
          .then(() => setReportStatus(report.id, 'reviewed'))
          .then(load)
          .catch(() => showAlert(t('admin.reports.deleteMessageError')))
          .finally(() => setBusyId(null));
      },
      { confirmText: t('admin.reports.deleteMessage') },
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
                {t('admin.reports.target', { kind: item.targetKind, id: item.targetId })}
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
              {parseGroupChatMessagePath(item.targetId) ? (
                <Button
                  variant="secondary"
                  disabled={busyId === item.id}
                  onPress={() => deleteReportedMessage(item)}
                  testID={`admin-report-delete-${item.id}`}
                >
                  {t('admin.reports.deleteMessage')}
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
