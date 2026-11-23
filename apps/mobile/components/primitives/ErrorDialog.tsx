import { ScrollView } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';
import { VStack } from './VStack';
import { useT } from '../../lib/i18n';

export interface ErrorDialogProps {
  /** The failure to show; `null` keeps the dialog closed. */
  message: string | null;
  onDismiss: () => void;
  testID?: string;
}

/**
 * The house way to put a failure in front of the user. `Alert.alert` is a no-op
 * on RN-Web, so this has to be a real view — but a hand-rolled centred box is a
 * trap, not a dialog.
 *
 * It exists because one was. The Buzón's bespoke error modal had no height cap
 * and no scroll, and error text is not always short: a strict-converter
 * rejection surfaces a ZodError, whose `message` is a pretty-printed JSON array
 * listing every valid enum option. That grew the box past the viewport and left
 * its only button below the fold — and on iOS a `Modal` has no swipe-dismiss
 * while `onRequestClose` fires on the Android back button alone. The screen was
 * unescapable without force-quitting.
 *
 * So: the body scrolls inside a height-capped `BottomSheet`, which already
 * carries its own ways out (drag or tap the grab bar, backdrop, back button) and
 * the bottom safe-area inset. The explicit button is the acknowledgement.
 */
export function ErrorDialog({ message, onDismiss, testID = 'error-dialog' }: ErrorDialogProps) {
  const { t } = useT();

  return (
    <BottomSheet
      visible={message !== null}
      onClose={onDismiss}
      closeLabel={t('common.close')}
      testID={testID}
      footer={
        <VStack className="px-5 pt-3">
          <Button fullWidth onPress={onDismiss} testID={`${testID}-dismiss`}>
            {t('common.close')}
          </Button>
        </VStack>
      }
    >
      <ScrollView
        testID={`${testID}-body`}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
      >
        <Text variant="body">{message ?? ''}</Text>
      </ScrollView>
    </BottomSheet>
  );
}
