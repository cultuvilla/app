import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Text } from '../primitives';
import { useT } from '../../lib/i18n';
import { CensoForm } from './CensoForm';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { getMyCensoAnswers } from '@cultuvilla/shared/services/membershipProfileService';
import type { ProfileFormField, ProfileAnswers } from '@cultuvilla/shared/models/municipality/CensoTypes';
import { useEntityOptions } from './censo/useEntityOptions';

/**
 * Villager census: answer the schema and edit your own answers. Content-only
 * so it embeds in the shared censo screen behind a role check.
 */
export function CensoAnswers({
  villageId,
  villageSlug,
  userId,
}: {
  villageId: string;
  villageSlug: string;
  userId: string;
}) {
  const { t } = useT();
  const [schema, setSchema] = useState<ProfileFormField[] | null>(null);
  const [initialAnswers, setInitialAnswers] = useState<ProfileAnswers>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { optionsByField } = useEntityOptions(villageId, schema ?? []);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        const [municipality, answers] = await Promise.all([
          getMunicipality(villageId),
          getMyCensoAnswers(villageId, userId),
        ]);
        setSchema(municipality?.community?.profileForm?.fields ?? []);
        setInitialAnswers(answers);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'unknown');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [villageId, userId]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (error) {
    return (
      <View className="p-4">
        <Text tone="danger">{error}</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerClassName="p-4 pb-12">
      <Text variant="h2" style={{ color: '#566047' }} className="px-1 mb-3">
        {t('censo.fillIntro')}
      </Text>
      <CensoForm villageId={villageId} villageSlug={villageSlug} userId={userId} schema={schema ?? []} initialAnswers={initialAnswers} entityOptionsByField={optionsByField} />
    </ScrollView>
  );
}
