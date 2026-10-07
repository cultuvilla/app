import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { HStack, Pressable, Text, VStack } from '../primitives';
import { createContentReport } from '@cultuvilla/shared/services/contentReportService';
import { blockUser } from '@cultuvilla/shared/services/blockedUserService';
import {
  REPORT_REASONS,
  type ReportReason,
  type ReportTargetKind,
} from '@cultuvilla/shared/models';
import { iconSizes, colors } from '@cultuvilla/shared/design-system';
import { useT } from '../../lib/i18n';

const SHEET_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.9);

const REASON_ICONS: Record<ReportReason, keyof typeof Ionicons.glyphMap> = {
  spam: 'megaphone-outline',
  harassment: 'sad-outline',
  hate: 'flame-outline',
  sexual: 'eye-off-outline',
  violence: 'warning-outline',
  falseInfo: 'help-circle-outline',
  other: 'ellipsis-horizontal',
};

export type ReportTarget = {
  kind: ReportTargetKind;
  id: string;
  municipalityId: string;
  /** Author of the reported content; enables the "block this person" row. */
  authorUserId?: string | null;
};

/**
 * The single in-app path for reporting user-generated content, and — when the
 * target has a known author who is not the viewer — for blocking that person.
 *
 * Both stores require this for UGC: Play's content-rating questionnaire asks
 * for it, and App Store guideline 1.2 requires reporting *and* blocking. Every
 * surface that renders somebody else's words opens this sheet rather than
 * rolling its own menu.
 */
export function ReportSheet({
  visible,
  target,
  reporterUserId,
  onClose,
  onBlocked,
}: {
  visible: boolean;
  target: ReportTarget | null;
  reporterUserId: string;
  onClose: () => void;
  onBlocked?: (blockedUserId: string) => void;
}) {
  const { t } = useT();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'reported' | 'blocked' | null>(null);

  const close = () => {
    setDone(null);
    onClose();
  };

  const canBlock =
    !!target?.authorUserId && target.authorUserId !== reporterUserId;

  const onReport = (reason: ReportReason) => {
    if (!target || submitting) return;
    setSubmitting(true);
    void (async () => {
      try {
        await createContentReport({
          municipalityId: target.municipalityId,
          targetKind: target.kind,
          targetId: target.id,
          targetAuthorUserId: target.authorUserId ?? null,
          reporterUserId,
          reason,
        });
        setDone('reported');
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const onBlock = () => {
    if (!target?.authorUserId || submitting) return;
    const blockedUserId = target.authorUserId;
    setSubmitting(true);
    void (async () => {
      try {
        await blockUser(reporterUserId, blockedUserId);
        onBlocked?.(blockedUserId);
        setDone('blocked');
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      {/* absoluteFill (not flex-1): RN-Web collapses a flex-1 Modal child to
          zero height, cropping the sheet. Mirrors TypeSheet. */}
      <RNPressable
        accessible={false}
        onPress={close}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
        ]}
      >
        <RNPressable
          accessible={false}
          // Its backdrop is not an accessibility element, so VoiceOver closes the
          // sheet with the escape gesture instead.
          onAccessibilityEscape={close}
          onPress={() => {}}
          className="bg-surface rounded-t-2xl overflow-hidden"
          style={{ maxHeight: SHEET_MAX_HEIGHT }}
        >
          <SafeAreaView edges={['bottom']} className="shrink">
            {done ? (
              <VStack gap={3} className="px-4 pt-6 pb-4 items-center">
                <Ionicons
                  name="checkmark-circle-outline"
                  size={iconSizes.lg}
                  color={colors.light.fg.muted}
                />
                <Text className="text-center">
                  {done === 'reported' ? t('report.sent') : t('report.blockDone')}
                </Text>
                <Pressable onPress={close} testID="report-sheet-close">
                  <Text tone="muted">{t('report.close')}</Text>
                </Pressable>
              </VStack>
            ) : (
              <>
                <View className="px-4 pt-4 pb-2">
                  <Text variant="h3">{t('report.title')}</Text>
                  <Text variant="bodySm" tone="muted">{t('report.subtitle')}</Text>
                </View>
                <ScrollView className="shrink">
                  {REPORT_REASONS.map((reason) => (
                    <Pressable
                      key={reason}
                      testID={`report-reason-${reason}`}
                      disabled={submitting}
                      onPress={() => onReport(reason)}
                      className="px-4 py-3"
                    >
                      <HStack gap={3} align="center">
                        <Ionicons
                          name={REASON_ICONS[reason]}
                          size={iconSizes.md}
                          color={colors.light.fg.muted}
                        />
                        <Text className="flex-1">{t(`report.reason.${reason}`)}</Text>
                      </HStack>
                    </Pressable>
                  ))}
                  {canBlock ? (
                    <Pressable
                      testID="report-block-user"
                      disabled={submitting}
                      onPress={onBlock}
                      className="px-4 py-3 border-t border-subtle"
                    >
                      <HStack gap={3} align="center">
                        <Ionicons
                          name="ban-outline"
                          size={iconSizes.md}
                          color={colors.light.fg.danger}
                        />
                        <VStack className="flex-1">
                          <Text>{t('report.blockUser')}</Text>
                          <Text variant="caption" tone="muted">{t('report.blockHint')}</Text>
                        </VStack>
                      </HStack>
                    </Pressable>
                  ) : null}
                </ScrollView>
                {submitting ? (
                  <View className="py-3 items-center">
                    <ActivityIndicator />
                  </View>
                ) : null}
              </>
            )}
          </SafeAreaView>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}
