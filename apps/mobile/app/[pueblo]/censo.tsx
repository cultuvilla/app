import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { colors } from '@cultuvilla/shared/design-system';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Screen } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { CensoSchemaEditor } from '../../components/feature/CensoSchemaEditor';
import { CensoAnswers } from '../../components/feature/CensoAnswers';
import { useAuth } from '../../lib/auth/useAuth';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useT } from '../../lib/i18n';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';

// Role-mode censo: one shared screen. An organizer authors the schema; a
// villager answers (and edits their own answers). No proposals.
function CensoScreen() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { user } = useAuth();
  const { t } = useT();
  const { canManage, loading } = useEntityCapabilities(villageId);
  const [villageName, setVillageName] = useState<string | null>(null);

  useEffect(() => {
    if (!villageId) return;
    let cancelled = false;
    getMunicipality(villageId).then((m) => {
      if (!cancelled) setVillageName(m?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [villageId]);

  if (!villageId || !user) return null;

  const title = villageName ? t('censo.titleNamed', { village: villageName }) : t('censo.title');

  return (
    <Screen padded={false}>
      <ScreenHeader title={title} titleColor={colors.light.fg.accent} />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : canManage && mode !== 'fill' ? (
        // Admins author the schema by default; `mode=fill` lets them answer it
        // like any villager. Non-admins always answer.
        <CensoSchemaEditor villageId={villageId} />
      ) : (
        <CensoAnswers villageId={villageId} villageSlug={villageSlug} userId={user.uid} />
      )}
    </Screen>
  );
}

export default withVillageRoute(CensoScreen);
