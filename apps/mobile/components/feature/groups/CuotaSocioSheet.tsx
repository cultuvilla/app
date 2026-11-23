import { ScrollView } from 'react-native';
import { periodLabel, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import type { CuotaPayment } from '@cultuvilla/shared/services/cuotaService';
import { formatDate, formatDayKey } from '@cultuvilla/shared/utils';
import { BottomSheet, Button, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { centsLabel, CUOTA_STATUS_TONE } from '../../../lib/orgs/cuota';

/**
 * One socio's cuota, opened by tapping their row: where they stand, every
 * action on them, and their payments for the period with "Anular" on each.
 */
export function CuotaSocioSheet({
  visible,
  name,
  status,
  detail,
  reminderSentAt,
  entries,
  reversed,
  onRecord,
  onAssign,
  onReverse,
  onClose,
}: {
  visible: boolean;
  name: string;
  status: SocioCuotaStatus | null;
  detail: string;
  reminderSentAt: Date | null;
  entries: CuotaPayment[];
  reversed: ReadonlySet<string | null>;
  onRecord: () => void;
  onAssign: () => void;
  onReverse: (p: CuotaPayment) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={name} closeLabel={t('common.close')} testID="cuota-socio-sheet">
      <ScrollView style={{ flexShrink: 1 }} testID="cuota-socio-scroll">
        <VStack gap={3} className="px-5 pb-4">
          {status ? (
            <HStack gap={2} align="center" justify="between">
              <Text variant="bodySm" tone="muted" className="flex-1">
                {detail}
              </Text>
              <Text variant="bodySm" tone={CUOTA_STATUS_TONE[status.status]} className="font-bold">
                {t(`groups.cuota.status.${status.status}`)}
              </Text>
            </HStack>
          ) : null}
          {reminderSentAt ? (
            <Text variant="caption" tone="muted" testID="cuota-socio-reminder">
              {t('groups.cuota.admin.reminderSent', { date: formatDate(reminderSentAt) })}
            </Text>
          ) : null}
          <HStack gap={2}>
            {status?.basis !== 'household' ? (
              <Button testID="cuota-socio-record" className="flex-1" onPress={onRecord}>
                {t('groups.cuota.admin.recordPayment')}
              </Button>
            ) : null}
            <Button testID="cuota-socio-assign" variant="secondary" className="flex-1" onPress={onAssign}>
              {t('groups.cuota.admin.assign')}
            </Button>
          </HStack>
          {entries.length > 0 ? (
            <VStack gap={1}>
              <Text variant="bodySm" className="font-bold">
                {t('groups.cuota.history')}
              </Text>
              {entries.map((p) => (
                <HStack key={p.id} gap={2} align="center" justify="between" className="py-1" testID={`cuota-entry-${p.id}`}>
                  <Text variant="bodySm" tone={reversed.has(p.id) || p.kind === 'reversal' ? 'muted' : 'primary'} className="flex-1">
                    {[
                      t('groups.cuota.entryLine', {
                        period: periodLabel(p.periodKey),
                        amount: centsLabel(p.amountCents),
                        method: t(`groups.cuota.methods.${p.method}`),
                        date: formatDayKey(p.paidOn),
                      }),
                      p.kind === 'reversal' ? t('groups.cuota.reversal') : reversed.has(p.id) ? t('groups.cuota.reversed') : null,
                      p.note,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {p.kind === 'payment' && !reversed.has(p.id) ? (
                    <Pressable testID={`cuota-reverse-${p.id}`} accessibilityRole="button" hitSlop={8} onPress={() => onReverse(p)}>
                      <Text variant="bodySm" tone="danger" className="font-medium">
                        {t('groups.cuota.admin.reverse')}
                      </Text>
                    </Pressable>
                  ) : null}
                </HStack>
              ))}
            </VStack>
          ) : null}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
