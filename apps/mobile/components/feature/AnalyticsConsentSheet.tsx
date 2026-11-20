import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { BottomSheet, Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';
import { AnalyticsConsentChoice } from './AnalyticsConsentChoice';

export interface AnalyticsConsentSheetProps {
  visible: boolean;
  busy: boolean;
  onAnswer: (granted: boolean) => void;
  /** Closed without answering: the account stays unasked. */
  onDismiss: () => void;
}

/** The one-time usage-analytics question for an account that has never answered it. */
export function AnalyticsConsentSheet({ visible, busy, onAnswer, onDismiss }: AnalyticsConsentSheetProps) {
  const { t } = useT();
  return (
    <BottomSheet
      visible={visible}
      onClose={onDismiss}
      closeLabel={t('privacy.analyticsConsent.close')}
      testID="analytics-consent-sheet"
      footer={<AnalyticsConsentChoice value={null} onChange={onAnswer} disabled={busy} />}
    >
      <VStack gap={3} align="center" className="px-2 pb-2">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-accent-subtle">
          <Ionicons name="bar-chart-outline" size={iconSizes.lg} color={colors.light.fg.accent} />
        </View>
        <Text variant="h3" className="text-center">
          {t('privacy.analyticsConsent.question')}
        </Text>
        <Text tone="muted" className="text-center">
          {t('privacy.analyticsConsent.body')}
        </Text>
      </VStack>
    </BottomSheet>
  );
}
