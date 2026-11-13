import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { parseEuroCents, type CuotaPaymentMethod, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import { BottomSheet, Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { centsLabel } from '../../../lib/orgs/cuota';
import { addToTally, EMPTY_TALLY, matchesSocio, type DeskTally } from '../../../lib/orgs/cuotaCollection';

export interface DeskSocio {
  id: string;
  name: string;
  socioNumber: number | null;
  status: SocioCuotaStatus;
}

/** The methods people pay with at a table. Domiciliación never happens there. */
const DESK_METHODS: readonly CuotaPaymentMethod[] = ['efectivo', 'bizum', 'transferencia'];
const MAX_RESULTS = 8;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * "Cobrar en la mesa": the asamblea's cash desk. Type a name or number, tap
 * how they paid, next. The running total since it opened is what the cash box
 * should hold; it lives as long as the cuota screen does.
 */
export function CuotaCashDesk({
  visible,
  socios,
  onRecord,
  onClose,
}: {
  visible: boolean;
  /** Everyone who pays their own cuota this period (no household rows). */
  socios: readonly DeskSocio[];
  onRecord: (socioId: string, amountCents: number, method: CuotaPaymentMethod) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [otherAmount, setOtherAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [tally, setTally] = useState<DeskTally>(EMPTY_TALLY);
  const [last, setLast] = useState<string | null>(null);

  const selected = socios.find((s) => s.id === selectedId) ?? null;
  const results = useMemo(
    () => (query.trim() ? socios.filter((s) => matchesSocio(query, s.name, s.socioNumber)).slice(0, MAX_RESULTS) : []),
    [query, socios],
  );
  const left = selected ? Math.max(0, selected.status.owedCents - selected.status.paidCents) : 0;

  const pick = (id: string) => {
    setSelectedId(id);
    setOtherAmount(null);
    setError(undefined);
  };

  const charge = (method: CuotaPaymentMethod) => {
    if (!selected) return;
    const cents = otherAmount === null ? left : parseEuroCents(otherAmount);
    if (cents === null || cents <= 0) {
      setError(t('groups.cuota.settings.amountInvalid'));
      return;
    }
    setSaving(true);
    onRecord(selected.id, cents, method)
      .then(() => {
        setTally((prev) => addToTally(prev, method, cents));
        setLast(t('groups.cuota.desk.recorded', { name: selected.name, amount: centsLabel(cents) }));
        setSelectedId(null);
        setOtherAmount(null);
        setQuery('');
      })
      .catch(() => showAlert(t('groups.cuota.error')))
      .finally(() => setSaving(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.cuota.desk.title')}
      closeLabel={t('common.close')}
      maxHeightRatio={0.95}
      testID="cuota-desk"
      footer={
        <VStack className="px-5 pt-3" gap={1}>
          <Text variant="bodySm" className="text-center font-bold" testID="cuota-desk-tally">
            {t('groups.cuota.desk.tally', { count: tally.count, cash: centsLabel(tally.byMethod.efectivo ?? 0) })}
          </Text>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="cuota-desk-scroll">
        <VStack gap={3} className="px-5 pb-4">
          <Input
            value={query}
            onChangeText={(next) => {
              setQuery(next);
              setSelectedId(null);
            }}
            placeholder={t('groups.cuota.desk.search')}
            autoCorrect={false}
            testID="cuota-desk-search"
          />
          {last && !selected ? (
            <Text variant="bodySm" tone="success" testID="cuota-desk-last">
              {last}
            </Text>
          ) : null}

          {selected ? (
            <VStack gap={3} className="rounded-lg bg-surface-elevated border border-subtle p-4" testID="cuota-desk-card">
              <HStack gap={3} align="center">
                <View className="w-10 h-10 rounded-full bg-secondary items-center justify-center">
                  <Text tone="onSecondary" className="font-bold">
                    {initials(selected.name)}
                  </Text>
                </View>
                <VStack className="flex-1">
                  <Text className="font-bold">{selected.name}</Text>
                  <Text variant="bodySm" tone="muted">
                    {[
                      selected.socioNumber !== null ? t('groups.cuota.desk.number', { number: selected.socioNumber }) : null,
                      left > 0 ? t('groups.cuota.desk.owes', { amount: centsLabel(left) }) : t('groups.cuota.status.al_dia'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </VStack>
              </HStack>
              {otherAmount !== null ? (
                <Input
                  label={t('groups.cuota.payment.amount')}
                  value={otherAmount}
                  onChangeText={setOtherAmount}
                  keyboardType="decimal-pad"
                  error={error}
                  testID="cuota-desk-amount"
                />
              ) : null}
              <HStack gap={2} className="flex-wrap">
                {DESK_METHODS.map((m) => (
                  <Button
                    key={m}
                    variant={m === 'efectivo' ? 'primary' : 'secondary'}
                    disabled={saving || (otherAmount === null && left === 0)}
                    className="grow basis-[45%]"
                    testID={`cuota-desk-method-${m}`}
                    onPress={() => charge(m)}
                  >
                    {t(`groups.cuota.methods.${m}`)}
                  </Button>
                ))}
                {otherAmount === null ? (
                  <Button
                    variant="ghost"
                    className="grow basis-[45%]"
                    testID="cuota-desk-other"
                    onPress={() => setOtherAmount('')}
                  >
                    {t('groups.cuota.payment.other')}
                  </Button>
                ) : null}
              </HStack>
            </VStack>
          ) : (
            <VStack gap={1}>
              {query.trim() && results.length === 0 ? (
                <Text tone="muted" variant="bodySm" testID="cuota-desk-none">
                  {t('groups.cuota.desk.none')}
                </Text>
              ) : null}
              {results.map((s) => {
                const owes = Math.max(0, s.status.owedCents - s.status.paidCents);
                return (
                  <Pressable
                    key={s.id}
                    testID={`cuota-desk-result-${s.id}`}
                    accessibilityRole="button"
                    onPress={() => pick(s.id)}
                    className="py-3 border-b border-subtle"
                  >
                    <HStack gap={2} align="center">
                      <Text variant="bodySm" tone="muted" className="w-8 text-right">
                        {s.socioNumber ?? ''}
                      </Text>
                      <Text className="flex-1">{s.name}</Text>
                      <Text variant="bodySm" tone={owes > 0 ? 'primary' : 'success'} className="font-bold">
                        {owes > 0 ? centsLabel(owes) : t('groups.cuota.status.al_dia')}
                      </Text>
                    </HStack>
                  </Pressable>
                );
              })}
            </VStack>
          )}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
