import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { parseSocioNumber } from '@cultuvilla/shared/models/organization';
import { BottomSheet, Button, Input, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

export interface TypedSocioValues {
  displayName: string;
  /** As typed; parsed on save. */
  socioNumber: string;
  phone: string;
  email: string;
}

export interface TypedSocioSaved {
  displayName: string;
  socioNumber: number | null;
  phone: string;
  email: string;
}

const EMPTY: TypedSocioValues = { displayName: '', socioNumber: '', phone: '', email: '' };

/** Add or correct a socio who has no account: a name, and optional number, phone and email. */
export function TypedSocioSheet({
  visible,
  initial,
  isNumberTaken,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** Null to add a new socio. */
  initial: TypedSocioValues | null;
  isNumberTaken: (socioNumber: number) => boolean;
  onSave: (values: TypedSocioSaved) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [values, setValues] = useState<TypedSocioValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | undefined>();
  const [numberError, setNumberError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Reset on open only: `initial` is rebuilt on every parent render, and a
  // roster snapshot landing mid-edit must not wipe what is being typed.
  useEffect(() => {
    if (visible) {
      setValues(initial ?? EMPTY);
      setError(undefined);
      setNumberError(undefined);
    }
  }, [visible]);

  const save = () => {
    const socioNumber = parseSocioNumber(values.socioNumber);
    const nameError = values.displayName.trim() ? undefined : t('groups.socios.nameRequired');
    const numberProblem =
      socioNumber === undefined
        ? t('groups.socios.socioNumberInvalid')
        : socioNumber !== null && isNumberTaken(socioNumber)
          ? t('groups.socios.socioNumberTaken')
          : undefined;
    setError(nameError);
    setNumberError(numberProblem);
    if (nameError || numberProblem || socioNumber === undefined) return;
    setSaving(true);
    onSave({ ...values, socioNumber })
      .then(onClose)
      .catch(() => showAlert(t('groups.socios.error')))
      .finally(() => setSaving(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t(initial ? 'groups.socios.editTitle' : 'groups.socios.addTitle')}
      closeLabel={t('common.close')}
      testID="typed-socio-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="typed-socio-save">
            {t('groups.socios.save')}
          </Button>
        </VStack>
      }
    >
      {/* Scrolls inside the sheet: with the keyboard up the sheet shrinks to the
          space left, and the lower fields must stay reachable. */}
      <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" testID="typed-socio-scroll">
      <VStack gap={3} className="px-5">
        <Input
          label={t('groups.socios.name')}
          value={values.displayName}
          onChangeText={(displayName) => setValues((v) => ({ ...v, displayName }))}
          error={error}
          testID="typed-socio-name"
        />
        <VStack gap={1}>
          <Input
            label={t('groups.socios.socioNumber')}
            value={values.socioNumber}
            onChangeText={(socioNumber) => setValues((v) => ({ ...v, socioNumber }))}
            keyboardType="number-pad"
            error={numberError}
            testID="typed-socio-number"
          />
          {initial ? null : (
            <Text variant="caption" tone="muted">
              {t('groups.socios.socioNumberHint')}
            </Text>
          )}
        </VStack>
        <Input
          label={t('groups.socios.phone')}
          value={values.phone}
          onChangeText={(phone) => setValues((v) => ({ ...v, phone }))}
          keyboardType="phone-pad"
          testID="typed-socio-phone"
        />
        <Input
          label={t('groups.socios.email')}
          value={values.email}
          onChangeText={(email) => setValues((v) => ({ ...v, email }))}
          keyboardType="email-address"
          autoCapitalize="none"
          testID="typed-socio-email"
        />
      </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
