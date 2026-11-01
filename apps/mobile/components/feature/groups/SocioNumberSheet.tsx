import { useEffect, useState } from 'react';
import { parseSocioNumber } from '@cultuvilla/shared/models/organization';
import { BottomSheet, Button, Input, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';

/** An admin numbers, renumbers or un-numbers one row of the libro. */
export function SocioNumberSheet({
  visible,
  name,
  initial,
  isNumberTaken,
  onSave,
  onClose,
}: {
  visible: boolean;
  name: string;
  initial: number | null;
  isNumberTaken: (socioNumber: number) => boolean;
  onSave: (socioNumber: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setText(initial === null ? '' : String(initial));
      setError(undefined);
    }
  }, [visible]);

  const save = () => {
    const socioNumber = parseSocioNumber(text);
    if (socioNumber === undefined) {
      setError(t('groups.socios.socioNumberInvalid'));
      return;
    }
    if (socioNumber !== null && socioNumber !== initial && isNumberTaken(socioNumber)) {
      setError(t('groups.socios.socioNumberTaken'));
      return;
    }
    setSaving(true);
    onSave(socioNumber)
      .then(onClose)
      .catch(() => showAlert(t('groups.socios.error')))
      .finally(() => setSaving(false));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('groups.socios.numberTitle', { name })}
      closeLabel={t('common.close')}
      testID="socio-number-sheet"
      footer={
        <VStack className="px-5 pt-3">
          <Button onPress={save} loading={saving} fullWidth testID="socio-number-save">
            {t('groups.socios.save')}
          </Button>
        </VStack>
      }
    >
      <VStack gap={1} className="px-5">
        <Input
          label={t('groups.socios.numberLabel')}
          value={text}
          onChangeText={setText}
          keyboardType="number-pad"
          error={error}
          testID="socio-number-input"
        />
        <Text variant="caption" tone="muted">
          {t('groups.socios.numberClearHint')}
        </Text>
      </VStack>
    </BottomSheet>
  );
}
