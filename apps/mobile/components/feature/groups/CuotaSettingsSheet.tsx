import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  currentPeriodKey,
  MAX_CUOTA_TIERS,
  parseEuroCents,
  type CuotaPeriodicity,
  type CuotaSettingsInput,
  type CuotaTier,
} from '@cultuvilla/shared/models/organization';
import type { CuotaSettings } from '@cultuvilla/shared/services/cuotaService';
import { monthLongLabels } from '@cultuvilla/shared/utils';
import { BottomSheet, Button, HStack, Input, Pressable, Text, Toggle, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { centsInputValue } from '../../../lib/orgs/cuota';
import { ChoiceRow } from './ChoiceRow';

export type CuotaSettingsValues = Omit<CuotaSettingsInput, 'configuredBy' | 'updatedAt'>;

interface TierDraft {
  id: string;
  name: string;
  amount: string;
  coversPersonas: boolean;
}

interface Draft {
  amount: string;
  periodicity: CuotaPeriodicity;
  dueMonth: number;
  dueDay: string;
  graceDays: string;
  bizum: string;
  iban: string;
  payInstructions: string;
  remindersEnabled: boolean;
  tiers: TierDraft[];
}

function draftOf(settings: CuotaSettings | null): Draft {
  return {
    amount: settings ? centsInputValue(settings.amountCents) : '',
    periodicity: settings?.periodicity ?? 'yearly',
    dueMonth: settings?.dueMonth ?? 1,
    dueDay: String(settings?.dueDay ?? 1),
    graceDays: String(settings?.graceDays ?? 30),
    bizum: settings?.bizum ?? '',
    iban: settings?.iban ?? '',
    payInstructions: settings?.payInstructions ?? '',
    remindersEnabled: settings?.remindersEnabled ?? false,
    tiers: (settings?.tiers ?? []).map((tier) => ({ ...tier, amount: centsInputValue(tier.amountCents) })),
  };
}

function newTierId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function intIn(text: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= min && n <= max ? n : null;
}

type Errors = Partial<Record<'amount' | 'dueDay' | 'graceDays' | `tier-${string}`, string>>;

/**
 * Configure the cuota: amount, period, due date, grace, how to pay, tiers and
 * the reminders. A first configuration starts tracking at the current period
 * with the reminders off, so no socio is reminded before the treasurer has
 * recorded the payments already collected on paper.
 */
export function CuotaSettingsSheet({
  visible,
  settings,
  signerName,
  onSave,
  onClose,
}: {
  visible: boolean;
  settings: CuotaSettings | null;
  /** Who the reminders would be signed by today, for the hint. */
  signerName: string | null;
  onSave: (values: CuotaSettingsValues) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft>(() => draftOf(settings));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Reset on open only, like TypedSocioSheet: a snapshot mid-edit must not wipe the form.
  useEffect(() => {
    if (visible) {
      setDraft(draftOf(settings));
      setErrors({});
    }
  }, [visible]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setTier = (id: string, patch: Partial<TierDraft>) =>
    setDraft((d) => ({ ...d, tiers: d.tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)) }));

  const save = () => {
    const next: Errors = {};
    const amountCents = parseEuroCents(draft.amount);
    if (amountCents === null) next.amount = t('groups.cuota.settings.amountInvalid');
    const dueDay = intIn(draft.dueDay, 1, 31);
    if (dueDay === null) next.dueDay = t('groups.cuota.settings.dueDayInvalid');
    const graceDays = intIn(draft.graceDays, 0, 365);
    if (graceDays === null) next.graceDays = t('groups.cuota.settings.graceDaysInvalid');
    const tiers: CuotaTier[] = [];
    for (const tier of draft.tiers) {
      const cents = parseEuroCents(tier.amount);
      if (!tier.name.trim()) next[`tier-${tier.id}`] = t('groups.cuota.settings.tierNameRequired');
      else if (cents === null) next[`tier-${tier.id}`] = t('groups.cuota.settings.amountInvalid');
      else tiers.push({ id: tier.id, name: tier.name.trim(), amountCents: cents, coversPersonas: tier.coversPersonas });
    }
    setErrors(next);
    if (amountCents === null || dueDay === null || graceDays === null || Object.keys(next).length > 0) return;

    // A changed period restarts tracking now: a yearly '2026' and a monthly
    // '2026-10' are different calendars.
    const keepStart = settings && settings.periodicity === draft.periodicity;
    setSaving(true);
    onSave({
      amountCents,
      periodicity: draft.periodicity,
      dueMonth: draft.dueMonth,
      dueDay,
      graceDays,
      startPeriod: keepStart ? settings.startPeriod : currentPeriodKey(draft.periodicity),
      tiers,
      bizum: draft.bizum,
      iban: draft.iban,
      payInstructions: draft.payInstructions,
      remindersEnabled: draft.remindersEnabled,
    })
      .then(onClose)
      .catch(() => showAlert(t('groups.cuota.error')))
      .finally(() => setSaving(false));
  };

  const months = monthLongLabels();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.cuota.settings.title')}
      closeLabel={t('common.close')}
      testID="cuota-settings-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="cuota-settings-save">
            {t('groups.cuota.settings.save')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="cuota-settings-scroll">
        <VStack gap={3} className="px-5 pb-4">
          <Input
            label={t('groups.cuota.settings.amount')}
            value={draft.amount}
            onChangeText={(v) => set('amount', v)}
            keyboardType="decimal-pad"
            error={errors.amount}
            testID="cuota-settings-amount"
          />
          <Text variant="bodySm" className="font-bold">
            {t('groups.cuota.settings.periodicity')}
          </Text>
          <ChoiceRow
            testID="cuota-settings-periodicity"
            value={draft.periodicity}
            options={(['yearly', 'monthly'] as const).map((p) => ({ value: p, label: t(`groups.cuota.periodicity.${p}`) }))}
            onChange={(p) => set('periodicity', p)}
          />
          {draft.periodicity === 'yearly' ? (
            <>
              <Text variant="bodySm" className="font-bold">
                {t('groups.cuota.settings.dueMonth')}
              </Text>
              <ChoiceRow
                testID="cuota-settings-month"
                value={String(draft.dueMonth)}
                options={months.map((label, i) => ({ value: String(i + 1), label }))}
                onChange={(m) => set('dueMonth', Number(m))}
              />
            </>
          ) : null}
          <Input
            label={t('groups.cuota.settings.dueDay')}
            value={draft.dueDay}
            onChangeText={(v) => set('dueDay', v)}
            keyboardType="number-pad"
            error={errors.dueDay}
            testID="cuota-settings-day"
          />
          <Input
            label={t('groups.cuota.settings.graceDays')}
            value={draft.graceDays}
            onChangeText={(v) => set('graceDays', v)}
            keyboardType="number-pad"
            error={errors.graceDays}
            testID="cuota-settings-grace"
          />
          <Input
            label={t('groups.cuota.settings.bizum')}
            value={draft.bizum}
            onChangeText={(v) => set('bizum', v)}
            keyboardType="phone-pad"
            testID="cuota-settings-bizum"
          />
          <Input
            label={t('groups.cuota.settings.iban')}
            value={draft.iban}
            onChangeText={(v) => set('iban', v)}
            autoCapitalize="characters"
            testID="cuota-settings-iban"
          />
          <Input
            label={t('groups.cuota.settings.payInstructions')}
            value={draft.payInstructions}
            onChangeText={(v) => set('payInstructions', v)}
            multiline
            testID="cuota-settings-instructions"
          />

          <Text variant="bodySm" className="font-bold pt-2">
            {t('groups.cuota.settings.tiers')}
          </Text>
          <Text variant="bodySm" tone="muted">
            {t('groups.cuota.settings.tiersHint')}
          </Text>
          {draft.tiers.map((tier) => (
            <VStack key={tier.id} gap={2} className="py-2 border-b border-subtle" testID={`cuota-tier-${tier.id}`}>
              <Input
                label={t('groups.cuota.settings.tierName')}
                value={tier.name}
                onChangeText={(name) => setTier(tier.id, { name })}
                error={errors[`tier-${tier.id}`]}
                testID={`cuota-tier-name-${tier.id}`}
              />
              <Input
                label={t('groups.cuota.settings.amount')}
                value={tier.amount}
                onChangeText={(amount) => setTier(tier.id, { amount })}
                keyboardType="decimal-pad"
                testID={`cuota-tier-amount-${tier.id}`}
              />
              <Toggle
                testID={`cuota-tier-covers-${tier.id}`}
                value={tier.coversPersonas}
                label={t('groups.cuota.settings.tierCovers')}
                onValueChange={(coversPersonas) => setTier(tier.id, { coversPersonas })}
              />
              <Pressable
                testID={`cuota-tier-remove-${tier.id}`}
                accessibilityRole="button"
                onPress={() => setDraft((d) => ({ ...d, tiers: d.tiers.filter((x) => x.id !== tier.id) }))}
              >
                <Text variant="bodySm" className="text-accent">
                  {t('groups.cuota.settings.removeTier')}
                </Text>
              </Pressable>
            </VStack>
          ))}
          {draft.tiers.length < MAX_CUOTA_TIERS ? (
            <HStack>
              <Button
                variant="secondary"
                testID="cuota-tier-add"
                onPress={() =>
                  setDraft((d) => ({ ...d, tiers: [...d.tiers, { id: newTierId(), name: '', amount: '', coversPersonas: false }] }))
                }
              >
                {t('groups.cuota.settings.addTier')}
              </Button>
            </HStack>
          ) : null}

          <VStack gap={1} className="pt-2">
            <Toggle
              testID="cuota-settings-reminders"
              value={draft.remindersEnabled}
              label={t('groups.cuota.settings.reminders')}
              onValueChange={(v) => set('remindersEnabled', v)}
            />
            <Text variant="bodySm" tone="muted">
              {signerName
                ? t('groups.cuota.settings.remindersHint', { name: signerName })
                : t('groups.cuota.settings.remindersHintNoSigner')}
            </Text>
          </VStack>
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
