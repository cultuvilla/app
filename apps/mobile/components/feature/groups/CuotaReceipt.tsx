import { View } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { periodLabel, type CuotaStatus } from '@cultuvilla/shared/models/organization';
import { formatDayKey } from '@cultuvilla/shared/utils';
import { Card, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { copyText } from '../../../lib/clipboard';
import { centsLabel } from '../../../lib/orgs/cuota';
import type { CuotaReceipt, PaidEntry } from '../../../lib/orgs/cuotaReceipt';

const STAMP_TONE: Record<CuotaStatus, keyof typeof colors.light.fg> = {
  al_dia: 'success',
  pendiente: 'accent',
  vencida: 'danger',
};

/** The rubber stamp across the receipt's corner. */
function Stamp({ status, label }: { status: CuotaStatus; label: string }) {
  const color = colors.light.fg[STAMP_TONE[status]];
  return (
    <View
      testID={`my-cuota-stamp-${status}`}
      className="absolute right-4 top-4 rounded-sm px-2 py-0.5"
      style={{ borderWidth: 2, borderColor: color, transform: [{ rotate: '-12deg' }] }}
    >
      <Text variant="bodySm" className="font-bold tracking-widest" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}

export interface ReceiptLine {
  socioId: string;
  name: string;
  detail: string;
}

/** The big card: what is owed (or paid) this period, the stamp, the days left, and who it covers. */
export function CuotaReceiptCard({
  periodKey,
  receipt,
  lines,
}: {
  periodKey: string;
  receipt: CuotaReceipt;
  lines: ReceiptLine[];
}) {
  const { t } = useT();
  const paid = receipt.status === 'al_dia';
  const amount = paid ? receipt.paidCents : receipt.dueCents;
  const stamp = paid && receipt.paidCents === 0 ? t('groups.myCuota.stamp.covered') : t(`groups.myCuota.stamp.${receipt.status}`);

  const dueLine = (() => {
    if (!receipt.dueOn || receipt.daysLeft === null) return null;
    const date = formatDayKey(receipt.dueOn, 'dayMonth');
    if (receipt.daysLeft < 0) return t('groups.cuota.overdueSince', { date });
    if (receipt.daysLeft === 0) return t('groups.myCuota.dueToday');
    return `${t('groups.cuota.dueOn', { date })} · ${t('groups.myCuota.daysLeft', { count: receipt.daysLeft })}`;
  })();

  return (
    <Card variant="elevated" testID="my-cuota-receipt">
      <Stamp status={receipt.status} label={stamp} />
      <VStack gap={1}>
        <Text variant="bodySm" tone="muted">
          {t('groups.cuota.periodTitle', { period: periodLabel(periodKey) })}
        </Text>
        {amount > 0 ? (
          <Text variant="display" testID="my-cuota-amount">
            {centsLabel(amount)}
          </Text>
        ) : null}
        {dueLine ? (
          <Text variant="bodySm" tone={receipt.status === 'vencida' ? 'danger' : 'primary'} testID="my-cuota-due">
            {dueLine}
          </Text>
        ) : null}
      </VStack>
      {lines.length > 0 ? (
        <VStack gap={1} className="mt-3 border-t border-dashed border-subtle pt-3">
          {lines.map((line) => (
            <HStack key={line.socioId} gap={2} justify="between" testID={`my-cuota-row-${line.socioId}`}>
              <Text variant="bodySm" className="flex-1 font-bold">
                {line.name}
              </Text>
              <Text variant="bodySm" tone="muted">
                {line.detail}
              </Text>
            </HStack>
          ))}
        </VStack>
      ) : null}
    </Card>
  );
}

function CopyRow({ label, value, testID }: { label: string; value: string; testID: string }) {
  const { t } = useT();
  return (
    <HStack gap={3} align="center" testID={testID}>
      <VStack gap={0} className="flex-1">
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text selectable className="font-mono">
          {value}
        </Text>
      </VStack>
      <Pressable
        testID={`${testID}-copy`}
        onPress={() => void copyText(value)}
        accessibilityRole="button"
        accessibilityLabel={t('groups.myCuota.copyLabel', { label })}
        className="rounded-md border border-accent px-3 py-1"
      >
        <Text variant="bodySm" className="font-bold text-accent">
          {t('groups.myCuota.copy')}
        </Text>
      </Pressable>
    </HStack>
  );
}

/** How to pay, each value with a copy button. */
export function CuotaPayWith({
  bizum,
  iban,
  concept,
  instructions,
}: {
  bizum: string | null;
  iban: string | null;
  concept: string | null;
  instructions: string | null;
}) {
  const { t } = useT();
  if (!bizum && !iban && !instructions) return null;
  return (
    <VStack gap={2} testID="my-cuota-how-to-pay">
      <Text variant="caption" className="font-bold uppercase tracking-wider">
        {t('groups.myCuota.payWith')}
      </Text>
      <Card>
        <VStack gap={3}>
          {bizum ? <CopyRow label={t('groups.myCuota.bizum')} value={bizum} testID="my-cuota-bizum" /> : null}
          {iban ? <CopyRow label={t('groups.myCuota.iban')} value={iban} testID="my-cuota-iban" /> : null}
          {concept && (bizum || iban) ? <CopyRow label={t('groups.myCuota.concept')} value={concept} testID="my-cuota-concept" /> : null}
          {instructions ? <Text variant="bodySm">{instructions}</Text> : null}
        </VStack>
      </Card>
    </VStack>
  );
}

/** Past payments: a period chip, the amount and how, the day. */
export function CuotaPaidList({ entries, nameOf }: { entries: PaidEntry[]; nameOf: ((socioId: string) => string) | null }) {
  const { t } = useT();
  if (entries.length === 0) return null;
  return (
    <VStack gap={2} testID="my-cuota-paid">
      <Text variant="caption" className="font-bold uppercase tracking-wider">
        {t('groups.myCuota.paid')}
      </Text>
      {entries.map(({ payment, reversed }) => (
        <HStack key={payment.id} gap={3} align="center" testID={`my-cuota-entry-${payment.id}`}>
          <View className={`rounded-full px-2 py-0.5 ${reversed ? 'bg-subtle' : 'bg-success-subtle'}`}>
            <Text variant="caption" tone={reversed ? 'muted' : 'success'} className="font-bold">
              {periodLabel(payment.periodKey)}
            </Text>
          </View>
          <Text variant="bodySm" tone={reversed ? 'muted' : 'primary'} className={`flex-1 ${reversed ? 'line-through' : ''}`}>
            {[
              nameOf ? nameOf(payment.socioId) : null,
              centsLabel(payment.amountCents),
              t(`groups.cuota.methods.${payment.method}`),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text variant="caption" tone="muted">
            {reversed ? t('groups.cuota.reversed') : formatDayKey(payment.paidOn, 'dayMonthShort')}
          </Text>
        </HStack>
      ))}
    </VStack>
  );
}
