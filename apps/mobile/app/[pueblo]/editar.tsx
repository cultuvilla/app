import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Screen, VStack, Text, Input, Button } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useT } from '../../lib/i18n';
import { getMunicipality, updateVillageInfo } from '@cultuvilla/shared/services/municipalityService';

/**
 * Edit a village's basic info (description). Reachable by any member while the
 * village has no organizer (wiki phase), and by admins after. The write goes
 * through the `updateVillageInfo` callable, which enforces that authorization
 * server-side.
 */
function EditVillageInfoScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { t } = useT();
  const [description, setDescription] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!villageId) return;
    const m = await getMunicipality(villageId);
    setDescription(m?.community?.description ?? '');
  }, [villageId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!villageId || description === null) return;
    setSaving(true);
    try {
      await updateVillageInfo({ municipalityId: villageId, description });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  if (description === null) {
    return (
      <Screen padded={false}>
        <ScreenHeader title={t('editInfo.title')} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('editInfo.title')} />
      <ScrollView contentContainerClassName="p-4">
        <VStack gap={3}>
          <Text variant="h3">{t('editInfo.descriptionLabel')}</Text>
          <Input value={description} onChangeText={setDescription} multiline testID="village-edit-description" />

          <Button onPress={save} loading={saving} testID="village-edit-submit">
            {t('common.save')}
          </Button>
        </VStack>
      </ScrollView>
    </Screen>
  );
}

export default withVillageRoute(EditVillageInfoScreen);
