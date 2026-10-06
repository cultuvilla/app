import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { ambassadorTitleKey } from '@cultuvilla/shared/models/municipality';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';
import { BottomSheet, Button, Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';

export interface AmbassadorWelcomeSheetProps {
  visible: boolean;
  villageName: string;
  sex: Sex | null;
  onShare: () => void;
  onClose: () => void;
}

/**
 * The first time a new Embajador opens their pueblo: the title, said out loud,
 * with a one-tap share — the campaign travels through the people who hold it.
 */
export function AmbassadorWelcomeSheet({
  visible,
  villageName,
  sex,
  onShare,
  onClose,
}: AmbassadorWelcomeSheetProps) {
  const { t } = useT();
  const title = t(ambassadorTitleKey(sex));

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={t('ambassador.welcome.close')}
      testID="ambassador-welcome-sheet"
      footer={
        <VStack gap={2}>
          <Button fullWidth onPress={onShare} testID="ambassador-welcome-share">
            {t('ambassador.welcome.share')}
          </Button>
          <Button fullWidth variant="ghost" onPress={onClose} testID="ambassador-welcome-dismiss">
            {t('ambassador.welcome.dismiss')}
          </Button>
        </VStack>
      }
    >
      <VStack gap={3} align="center" className="px-2 pb-2">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-accent">
          <Ionicons name="ribbon" size={iconSizes.lg} color={colors.light.fg['on-accent']} />
        </View>
        <Text variant="h3" className="text-center">
          {t('ambassador.welcome.title', { title, village: villageName })}
        </Text>
        <Text tone="muted" className="text-center">
          {t('ambassador.welcome.body')}
        </Text>
      </VStack>
    </BottomSheet>
  );
}
