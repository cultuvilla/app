import { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  cleanLedgerCategoryName,
  ledgerCategoryChoices,
  ledgerCategoryKey,
  parseEuroCents,
  type LedgerCategoryChoice,
  type LedgerEntryKind,
} from '@cultuvilla/shared/models/organization';
import { createLedgerCategory, watchLedgerCategories, type LedgerCategory } from '@cultuvilla/shared/services/ledgerCategoryService';
import { watchAllLedgerEntries, type LedgerEntry } from '@cultuvilla/shared/services/recordsService';
import { DateField, FieldLabel, Input, VStack } from '../../primitives';
import { FormModal } from '../../layout/FormModal';
import { Stepper, type StepConfig } from '../Stepper';
import { SegmentedToggle } from '../SegmentedToggle';
import { LedgerCategoryChips } from './LedgerCategoryChips';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { dayKeyOfPickedDate, pickedDateOfDayKey, todayKey } from '../../../lib/orgs/cuota';

export interface LedgerEntryValues {
  kind: LedgerEntryKind;
  amountCents: number;
  on: string;
  concept: string;
  category: string | null;
}

const KINDS: readonly LedgerEntryKind[] = ['income', 'expense'];

/**
 * Note one income or expense beyond the cuota, in two steps: which and how
 * much; then what, when, and an optional category picked from the group's list of that kind. The entry keeps
 * the category's name, so a later rename leaves it as it was noted.
 */
export function LedgerEntrySheet({
  visible,
  orgId,
  uid,
  onSave,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  uid: string;
  onSave: (values: LedgerEntryValues) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [kind, setKind] = useState<LedgerEntryKind>('expense');
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(todayKey());
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setKind('expense');
      setAmount('');
      setOn(todayKey());
      setConcept('');
      setCategory(null);
    }
  }, [visible]);

  const categories = useWatch<LedgerCategory[]>('groups:watchLedgerCategories', visible ? orgId : null, (next, error) =>
    watchLedgerCategories(orgId, next, error),
  );
  const pastEntries = useWatch<LedgerEntry[]>('groups:watchAllLedgerEntries', visible ? orgId : null, (next, error) =>
    watchAllLedgerEntries(orgId, next, error),
  );
  const choices = useMemo(
    () => ledgerCategoryChoices(categories.data ?? [], pastEntries.data ?? [], kind),
    [categories.data, pastEntries.data, kind],
  );

  const changeKind = (next: LedgerEntryKind) => {
    setKind(next);
    setCategory(null);
  };
  // Not awaited: the write lands in the local cache at once and syncs later, so
  // the sheet never waits on the network to choose a category.
  const store = (name: string) => {
    createLedgerCategory(orgId, { kind, name }, uid).catch(() => showAlert(t('groups.records.error')));
  };
  const pick = (choice: LedgerCategoryChoice | null) => {
    setCategory(choice?.name ?? null);
    if (choice && !choice.stored) store(choice.name);
  };
  const createNamed = (typed: string) => {
    const existing = choices.find((c) => ledgerCategoryKey(c.name) === ledgerCategoryKey(typed));
    if (existing) {
      pick(existing);
      return;
    }
    const name = cleanLedgerCategoryName(typed);
    setCategory(name);
    store(name);
  };

  const cents = parseEuroCents(amount);
  // Shown once something is typed; until then the step's Siguiente is just off.
  const amountError = amount.trim() && (cents === null || cents === 0) ? t('groups.records.year.form.amountInvalid') : undefined;

  const save = () => {
    if (cents === null || cents === 0 || concept.trim() === '') return;
    setSaving(true);
    onSave({ kind, amountCents: cents, on, concept, category })
      .then(onClose)
      .catch(() => showAlert(t('groups.records.error')))
      .finally(() => setSaving(false));
  };

  const steps: StepConfig[] = [
    {
      key: 'amount',
      title: t('groups.records.year.form.stepAmount'),
      icon: 'cash-outline',
      validate: () => (cents === null || cents === 0 ? ['amount'] : []),
      render: () => (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" testID="ledger-scroll">
          <VStack gap={3} className="px-4 pt-4 pb-6">
            <SegmentedToggle
              testID="ledger-kind"
              value={kind}
              options={KINDS.map((k) => ({ value: k, label: t(`groups.records.year.form.kind.${k}`) }))}
              onChange={changeKind}
            />
            <Input
              label={t('groups.records.year.form.amount')}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              error={amountError}
              testID="ledger-amount"
            />
          </VStack>
        </ScrollView>
      ),
    },
    {
      key: 'detail',
      title: t('groups.records.year.form.stepDetail'),
      icon: 'document-text-outline',
      validate: () => (concept.trim() === '' ? ['concept'] : []),
      render: () => (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <VStack gap={3} className="px-4 pt-4 pb-6">
            <Input label={t('groups.records.year.form.concept')} value={concept} onChangeText={setConcept} testID="ledger-concept" />
            <DateField
              label={t('groups.records.year.form.date')}
              value={pickedDateOfDayKey(on)}
              onChange={(d) => setOn(d ? dayKeyOfPickedDate(d) : todayKey())}
              maximumDate={new Date()}
              testID="ledger-date"
            />
            <VStack gap={2}>
              <FieldLabel>{t('groups.records.year.form.category')}</FieldLabel>
              <LedgerCategoryChips choices={choices} value={category} onPick={pick} onCreate={createNamed} />
            </VStack>
          </VStack>
        </ScrollView>
      ),
    },
  ];

  return (
    <FormModal visible={visible} onClose={onClose} title={t('groups.records.year.form.title')} testID="ledger-sheet">
      <Stepper
        steps={steps}
        onComplete={save}
        submitLabel={t('groups.records.year.form.save')}
        loading={saving}
        primaryTestID="ledger-next"
        submitTestID="ledger-save"
      />
    </FormModal>
  );
}
