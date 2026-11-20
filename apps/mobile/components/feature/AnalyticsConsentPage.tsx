import { Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, HStack, Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';
import { AnalyticsConsentIllustration } from './AnalyticsConsentIllustration';

export interface AnalyticsConsentPageProps {
  visible: boolean;
  onAnswer: (granted: boolean) => void;
  /** Android back: closed without an answer, nothing stored. */
  onDismiss: () => void;
}

const MAX_ART_WIDTH = 360;
const GUTTER = 24;

/**
 * The usage-analytics question as a full-screen page: the village-chart
 * drawing, the question, one lead line, the small print, and the two answers
 * pinned at the bottom. Same size, side by side — refusing must be as easy as
 * accepting (RGPD art. 7, EDPB 05/2020); the yes is filled, the no outlined.
 * No close button: an answer, or Android back, are the only ways out.
 */
export function AnalyticsConsentPage({ visible, onAnswer, onDismiss }: AnalyticsConsentPageProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const artWidth = Math.min(width - GUTTER * 2, MAX_ART_WIDTH);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View
        className="flex-1 bg-surface"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        testID="analytics-consent-page"
      >
        <ScrollView contentContainerClassName="px-6 pt-6 pb-4" bounces={false}>
          <VStack gap={4}>
            <View className="items-center">
              <AnalyticsConsentIllustration width={artWidth} />
            </View>
            <Text variant="h2" className="font-bold" accessibilityRole="header">
              {t('privacy.analyticsConsent.title')}
            </Text>
            <Text>{t('privacy.analyticsConsent.lead')}</Text>
            <Text variant="bodySm" tone="muted">
              {t('privacy.analyticsConsent.smallPrint')}
            </Text>
          </VStack>
        </ScrollView>
        <HStack gap={3} className="px-6 pt-3 pb-6">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1 border-2"
            onPress={() => onAnswer(false)}
            testID="analytics-consent-no"
          >
            {t('privacy.analyticsConsent.no')}
          </Button>
          <Button
            size="lg"
            className="flex-1 border-2 border-accent"
            onPress={() => onAnswer(true)}
            testID="analytics-consent-yes"
          >
            {t('privacy.analyticsConsent.yes')}
          </Button>
        </HStack>
      </View>
    </Modal>
  );
}
