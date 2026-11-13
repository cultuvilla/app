import { Share, ScrollView } from 'react-native';
import { actaHeading, actaText } from '@cultuvilla/shared/export/recordsExport';
import type { Acta } from '@cultuvilla/shared/services/recordsService';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { observability } from '@cultuvilla/shared';
import { BottomSheet, Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';

/** One line of the acta list: heading, day, attendance — and for admins, whether socios see it. */
export function ActaRow({ acta, showVisibility, onOpen }: { acta: Acta; showVisibility: boolean; onOpen: () => void }) {
  const { t } = useT();
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} className="py-2 border-b border-subtle" testID={`acta-row-${acta.id}`}>
      <Text className="font-bold">{actaHeading(acta)}</Text>
      <Text variant="bodySm" tone="muted">
        {[
          formatDayKey(acta.heldOn, 'long'),
          t('groups.records.actas.attendees', { count: acta.attendees.length + acta.otherAttendees }),
          showVisibility ? t(acta.visibleToSocios ? 'groups.records.actas.visible' : 'groups.records.actas.hidden') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

function Section({ title, items, numbered }: { title: string; items: string[]; numbered: boolean }) {
  const { t } = useT();
  return (
    <VStack gap={1}>
      <Text className="font-bold">{title}</Text>
      {items.length === 0 ? (
        <Text tone="muted">{t('groups.records.actas.detail.none')}</Text>
      ) : (
        items.map((item, i) => <Text key={`${String(i)}-${item}`}>{numbered ? `${String(i + 1)}. ${item}` : item}</Text>)
      )}
    </VStack>
  );
}

/**
 * The whole acta, readable on the phone, with a share action that hands its
 * text to WhatsApp, mail or the notes app. Admins also edit or delete it.
 */
export function ActaDetailSheet({
  acta,
  orgName,
  onClose,
  onEdit,
  onDelete,
}: {
  acta: Acta | null;
  orgName: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useT();
  const share = () => {
    if (!acta) return;
    Share.share({ message: actaText(acta, orgName) }).catch((error: unknown) => observability.captureError(error, { scope: 'actaShare' }));
  };

  return (
    <BottomSheet
      visible={acta !== null}
      onClose={onClose}
      title={acta ? actaHeading(acta) : ''}
      closeLabel={t('common.close')}
      maxHeightRatio={0.92}
      testID="acta-detail"
      footer={
        <HStack gap={2} className="px-5 pt-3 flex-wrap">
          <Button onPress={share} testID="acta-share">
            {t('groups.records.actas.share')}
          </Button>
          {onEdit ? (
            <Button variant="secondary" onPress={onEdit} testID="acta-edit">
              {t('groups.records.actas.edit')}
            </Button>
          ) : null}
          {onDelete ? (
            <Button variant="ghost" onPress={onDelete} testID="acta-delete">
              {t('groups.records.actas.delete')}
            </Button>
          ) : null}
        </HStack>
      }
    >
      {acta ? (
        <ScrollView style={{ flexShrink: 1 }} testID="acta-detail-scroll">
          <VStack gap={3} className="px-5 pb-4">
            <VStack gap={1}>
              <Text variant="bodySm" tone="muted">
                {t(`groups.records.actas.body.${acta.body}`)}
              </Text>
              <Text>{`${t('groups.records.actas.detail.date')}: ${formatDayKey(acta.heldOn, 'long')}`}</Text>
              {acta.place ? <Text>{`${t('groups.records.actas.detail.place')}: ${acta.place}`}</Text> : null}
            </VStack>
            <Section
              title={`${t('groups.records.actas.detail.attendees')} (${String(acta.attendees.length + acta.otherAttendees)})`}
              items={[
                ...acta.attendees.map((a) => a.name),
                ...(acta.otherAttendees > 0 ? [t('groups.records.actas.detail.others', { count: acta.otherAttendees })] : []),
              ]}
              numbered={false}
            />
            <Section title={t('groups.records.actas.detail.agenda')} items={acta.agenda} numbered />
            <Section title={t('groups.records.actas.detail.agreements')} items={acta.agreements} numbered />
            <Text variant="caption" tone="muted">
              {t('groups.records.actas.detail.updated', { date: formatDate(acta.updatedAt) })}
            </Text>
          </VStack>
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}
