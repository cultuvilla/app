import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { parseEuroCents, type LedgerEntryKind } from '@cultuvilla/shared/models/organization';
import { BottomSheet, Button, DateField, Input, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { dayKeyOfPickedDate, pickedDateOfDayKey, todayKey } from '../../../lib/orgs/cuota';
import { ChoiceRow } from './ChoiceRow';

export interface LedgerEntryValues {
  kind: LedgerEntryKind;
  amountCents: number;
  on: string;
  concept: string;
  category: string;
}

const KINDS: readonly LedgerEntryKind[] = ['income', 'expense'];

/** Note one income or expense beyond the cuota: what, how much, when, and an optional category. */
export function LedgerEntrySheet({
  visible,
  onSave,
  onClose,
}: {
  visible: boolean;
  onSave: (values: LedgerEntryValues) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<LedgerEntryKind>('expense');
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(todayKey());
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; concept?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setKind('expense');
      setAmount('');
      setOn(todayKey());
      setConcept('');
      setCategory('');
      setErrors({});
    }
  }, [visible]);

  const save = () => {
    const cents = parseEuroCents(amount);
    const next = {
      amount: cents === null || cents === 0 ? t('groups.records.year.form.amountInvalid') : undefined,
      concept: concept.trim() === '' ? t('groups.records.year.form.conceptRequired') : undefined,
    };
    setErrors(next);
    if (next.amount || next.concept || cents === null) return;
    setSaving(true);
    onSave({ kind, amountCents: cents, on, concept, category })
      .then(onClose)
      .catch(() => showAlert(t('groups.records.error')))
      .finally(() => setSaving(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.records.year.form.title')}
      closeLabel={t('common.close')}
      testID="ledger-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="ledger-save">
            {t('groups.records.year.form.save')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="ledger-scroll">
        <VStack gap={3} className="px-5 pb-4">
          <ChoiceRow
            testID="ledger-kind"
            value={kind}
            options={KINDS.map((k) => ({ value: k, label: t(`groups.records.year.form.kind.${k}`) }))}
            onChange={setKind}
          />
          <Input
            label={t('groups.records.year.form.amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            error={errors.amount}
            testID="ledger-amount"
          />
          <Input
            label={t('groups.records.year.form.concept')}
            value={concept}
            onChangeText={setConcept}
            error={errors.concept}
            testID="ledger-concept"
          />
          <DateField
            label={t('groups.records.year.form.date')}
            value={pickedDateOfDayKey(on)}
            onChange={(d) => setOn(d ? dayKeyOfPickedDate(d) : todayKey())}
            maximumDate={new Date()}
            testID="ledger-date"
          />
          <Input label={t('groups.records.year.form.category')} value={category} onChangeText={setCategory} testID="ledger-category" />
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
