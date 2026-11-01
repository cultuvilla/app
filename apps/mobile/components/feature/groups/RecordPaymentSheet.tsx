import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { CUOTA_PAYMENT_METHODS, parseEuroCents, type CuotaPaymentMethod } from '@cultuvilla/shared/models/organization';
import { BottomSheet, Button, DateField, Input, Text, VStack } from '../../primitives';
import { SelectField } from './SelectField';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { centsInputValue, dayKeyOfPickedDate, pickedDateOfDayKey, todayKey } from '../../../lib/orgs/cuota';

export interface PaymentValues {
  amountCents: number;
  method: CuotaPaymentMethod;
  paidOn: string;
  note: string;
}

/** Record one payment the treasurer received: amount, how, when, and a note. */
export function RecordPaymentSheet({
  visible,
  socioName,
  suggestedCents,
  onSave,
  onClose,
}: {
  visible: boolean;
  socioName: string;
  /** What is still owed — the amount the form starts with. */
  suggestedCents: number;
  onSave: (values: PaymentValues) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<CuotaPaymentMethod>('efectivo');
  const [paidOn, setPaidOn] = useState(todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount(suggestedCents > 0 ? centsInputValue(suggestedCents) : '');
      setMethod('efectivo');
      setPaidOn(todayKey());
      setNote('');
      setError(undefined);
    }
  }, [visible]);

  const save = () => {
    const cents = parseEuroCents(amount);
    if (cents === null || cents === 0) {
      setError(t('groups.cuota.settings.amountInvalid'));
      return;
    }
    setSaving(true);
    onSave({ amountCents: cents, method, paidOn, note })
      .then(onClose)
      .catch(() => showAlert(t('groups.cuota.error')))
      .finally(() => setSaving(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.cuota.payment.title', { name: socioName })}
      closeLabel={t('common.close')}
      testID="cuota-payment-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="cuota-payment-save">
            {t('groups.cuota.payment.save')}
          </Button>
        </VStack>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="cuota-payment-scroll">
        <VStack gap={3} className="px-5 pb-4">
          <Input
            label={t('groups.cuota.payment.amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            error={error}
            testID="cuota-payment-amount"
          />
          <SelectField
            label={t('groups.cuota.payment.method')}
            testID="cuota-payment-method"
            value={method}
            options={CUOTA_PAYMENT_METHODS.map((m) => ({ value: m, label: t(`groups.cuota.methods.${m}`) }))}
            onChange={setMethod}
          />
          <DateField
            label={t('groups.cuota.payment.date')}
            value={pickedDateOfDayKey(paidOn)}
            onChange={(d) => setPaidOn(d ? dayKeyOfPickedDate(d) : todayKey())}
            maximumDate={new Date()}
            testID="cuota-payment-date"
          />
          <Input
            label={t('groups.cuota.payment.note')}
            value={note}
            onChangeText={setNote}
            testID="cuota-payment-note"
          />
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
