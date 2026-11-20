import { Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Screen, Text, VStack } from '../primitives';
import { ScreenHeader } from '../layout/ScreenHeader';
import { useT } from '../../lib/i18n';

export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/**
 * Third-party data credits. The pedanías, aldeas, parroquias and barrios seeded
 * on village activation come from OpenStreetMap, whose ODbL licence requires a
 * visible "© OpenStreetMap contributors" credit wherever the data is shown.
 */
export function AttributionsScreen() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  return (
    <Screen padded={false} bottomInset={false} topInset={false}>
      <ScreenHeader accent title={t('attributions.title')} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 24 }}
      >
        <VStack gap={2}>
          <Text variant="h3">{t('attributions.osm.heading')}</Text>
          <Text variant="body">{t('attributions.osm.credit')}</Text>
          <Text variant="body">{t('attributions.osm.body')}</Text>
        </VStack>
        <Button
          variant="secondary"
          onPress={() => void Linking.openURL(OSM_COPYRIGHT_URL).catch(() => {})}
        >
          {t('attributions.osm.link')}
        </Button>
      </ScrollView>
    </Screen>
  );
}
