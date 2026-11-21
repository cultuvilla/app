import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { BottomSheet, Button, Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';
import type { SoftAskTrigger } from '../../lib/push/softAskPolicy';

export interface PushSoftAskSheetProps {
  trigger: SoftAskTrigger | null;
  /** Interpolated into the village-join copy. */
  villageName?: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * The in-app ask that precedes the system permission dialog. Its whole job is
 * to make a concrete, true promise tied to what the user just did — a "no"
 * here costs nothing, while a "no" to the iOS system dialog is permanent.
 * Nothing here calls the OS; the provider does that only on accept.
 */
export function PushSoftAskSheet({
  trigger,
  villageName,
  busy,
  onAccept,
  onDecline,
}: PushSoftAskSheetProps) {
  const { t } = useT();
  const copyKey = trigger === 'village_join' ? 'villageJoin' : 'eventSignup';

  return (
    <BottomSheet
      visible={trigger !== null}
      onClose={onDecline}
      closeLabel={t('notifications.softAsk.close')}
      testID="push-soft-ask-sheet"
      footer={
        <VStack gap={2} className="px-5 pt-3">
          <Button fullWidth onPress={onAccept} loading={busy} testID="push-soft-ask-accept">
            {t('notifications.softAsk.accept')}
          </Button>
          <Button
            fullWidth
            variant="ghost"
            onPress={onDecline}
            disabled={busy}
            testID="push-soft-ask-decline"
          >
            {t('notifications.softAsk.decline')}
          </Button>
        </VStack>
      }
    >
      <VStack gap={3} align="center" className="px-5 pb-2">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-subtle">
          <Ionicons name="notifications-outline" size={iconSizes.lg} color={colors.light.fg.accent} />
        </View>
        <Text variant="h3" className="text-center">
          {t(`notifications.softAsk.${copyKey}.title`, { village: villageName ?? '' })}
        </Text>
        <Text tone="muted" className="text-center">
          {t(`notifications.softAsk.${copyKey}.body`)}
        </Text>
      </VStack>
    </BottomSheet>
  );
}
