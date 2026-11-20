import { BottomSheet } from '../primitives/BottomSheet';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { Button } from '../primitives/Button';
import { VStack } from '../primitives/VStack';
import { useT } from '../../lib/i18n';

export type RegisterSheetProps = {
  visible: boolean;
  reason?: string;
  onRegister: () => void;
  onDismiss: () => void;
};

export function RegisterSheet({ visible, reason, onRegister, onDismiss }: RegisterSheetProps) {
  const { t } = useT();

  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      title={t('guest.title')}
      closeLabel={t('guest.dismiss')}
      testID="register-sheet"
    >
      <VStack gap={3} className="px-5 pt-2">
        {reason ? <Text tone="muted">{reason}</Text> : null}
        <Button variant="primary" fullWidth onPress={onRegister}>
          {t('guest.register')}
        </Button>
        <Text tone="muted" variant="bodySm" className="text-center">
          {t('guest.newAccountHint')}
        </Text>
        <Pressable onPress={onDismiss} accessibilityLabel={t('guest.dismiss')} className="items-center py-2">
          <Text tone="muted">{t('guest.dismiss')}</Text>
        </Pressable>
      </VStack>
    </BottomSheet>
  );
}
