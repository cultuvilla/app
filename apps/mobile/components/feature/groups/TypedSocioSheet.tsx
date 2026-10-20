import { useEffect, useState } from 'react';
import { BottomSheet, Button, Input, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

export interface TypedSocioValues {
  displayName: string;
  phone: string;
  email: string;
}

const EMPTY: TypedSocioValues = { displayName: '', phone: '', email: '' };

/** Add or correct a socio who has no account: a name, and optional phone and email. */
export function TypedSocioSheet({
  visible,
  initial,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** Null to add a new socio. */
  initial: TypedSocioValues | null;
  onSave: (values: TypedSocioValues) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [values, setValues] = useState<TypedSocioValues>(initial ?? EMPTY);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Reset on open only: `initial` is rebuilt on every parent render, and a
  // roster snapshot landing mid-edit must not wipe what is being typed.
  useEffect(() => {
    if (visible) {
      setValues(initial ?? EMPTY);
      setError(undefined);
    }
  }, [visible]);

  const save = () => {
    if (!values.displayName.trim()) {
      setError(t('groups.socios.nameRequired'));
      return;
    }
    setSaving(true);
    onSave(values)
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
        <Button onPress={save} loading={saving} fullWidth testID="typed-socio-save">
          {t('groups.socios.save')}
        </Button>
      }
    >
      <VStack gap={3}>
        <Input
          label={t('groups.socios.name')}
          value={values.displayName}
          onChangeText={(displayName) => setValues((v) => ({ ...v, displayName }))}
          error={error}
          testID="typed-socio-name"
        />
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
    </BottomSheet>
  );
}
