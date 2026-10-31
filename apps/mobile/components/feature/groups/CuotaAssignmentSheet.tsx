import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { parseEuroCents, type CuotaSettingsData } from '@cultuvilla/shared/models/organization';
import type { CuotaAssignment } from '@cultuvilla/shared/services/cuotaService';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { BottomSheet, Button, HStack, Input, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { centsInputValue, centsLabel } from '../../../lib/orgs/cuota';

export interface AssignmentValues {
  tierId: string | null;
  exempt: boolean;
  customAmountCents: number | null;
}

const GENERAL = 'general';
const EXEMPT = 'exempt';
const CUSTOM = 'custom';

function choiceOf(a: CuotaAssignment | undefined): string {
  if (!a) return GENERAL;
  if (a.exempt) return EXEMPT;
  if (a.customAmountCents !== null) return CUSTOM;
  return a.tierId ?? GENERAL;
}

/** What one socio pays: the general cuota, a tier, an exemption, or their own amount. */
export function CuotaAssignmentSheet({
  visible,
  socioName,
  settings,
  assignment,
  onSave,
  onClose,
}: {
  visible: boolean;
  socioName: string;
  settings: Pick<CuotaSettingsData, 'amountCents' | 'tiers'>;
  assignment: CuotaAssignment | undefined;
  onSave: (values: AssignmentValues) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [choice, setChoice] = useState(GENERAL);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setChoice(choiceOf(assignment));
      setCustom(assignment?.customAmountCents != null ? centsInputValue(assignment.customAmountCents) : '');
      setError(undefined);
    }
  }, [visible]);

  const options = [
    { value: GENERAL, label: t('groups.cuota.assignment.general', { amount: centsLabel(settings.amountCents) }) },
    ...settings.tiers.map((tier) => ({ value: tier.id, label: t('groups.cuota.assignment.tier', { name: tier.name, amount: centsLabel(tier.amountCents) }) })),
    { value: EXEMPT, label: t('groups.cuota.assignment.exempt') },
    { value: CUSTOM, label: t('groups.cuota.assignment.custom') },
  ];

  const save = () => {
    let values: AssignmentValues = { tierId: null, exempt: false, customAmountCents: null };
    if (choice === EXEMPT) values = { ...values, exempt: true };
    else if (choice === CUSTOM) {
      const cents = parseEuroCents(custom);
      if (cents === null) {
        setError(t('groups.cuota.settings.amountInvalid'));
        return;
      }
      values = { ...values, customAmountCents: cents };
    } else if (choice !== GENERAL) values = { ...values, tierId: choice };
    setSaving(true);
    onSave(values)
      .then(onClose)
      .catch(() => showAlert(t('groups.cuota.error')))
      .finally(() => setSaving(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.cuota.assignment.title', { name: socioName })}
      closeLabel={t('common.close')}
      testID="cuota-assignment-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="cuota-assignment-save">
            {t('groups.cuota.assignment.save')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="cuota-assignment-scroll">
        <VStack gap={3} className="px-5 pb-4">
          <VStack gap={0} testID="cuota-assignment-choice">
            {options.map((o) => {
              const selected = o.value === choice;
              return (
                <Pressable
                  key={o.value}
                  testID={`cuota-assignment-choice-${o.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setChoice(o.value)}
                  className="py-3 border-b border-subtle"
                >
                  <HStack gap={3} align="center">
                    <Text className={`flex-1 ${selected ? 'font-bold' : ''}`}>{o.label}</Text>
                    {selected ? <Ionicons name="checkmark" size={iconSizes.md} color={colors.light.fg.accent} /> : null}
                  </HStack>
                </Pressable>
              );
            })}
          </VStack>
          {choice === CUSTOM ? (
            <Input
              label={t('groups.cuota.payment.amount')}
              value={custom}
              onChangeText={setCustom}
              keyboardType="decimal-pad"
              error={error}
              testID="cuota-assignment-amount"
            />
          ) : null}
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
