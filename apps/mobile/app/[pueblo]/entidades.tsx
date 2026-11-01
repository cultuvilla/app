import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { useLocalSearchParams, router } from 'expo-router';
import { Screen } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useT } from '../../lib/i18n';
import { OrganizationsManager } from '../../components/feature/proposable/OrganizationsManager';
import type { OrganizationType } from '@cultuvilla/shared/models/organization/OrganizationDataModel';

// ASCII query aliases: the add-content sheet can't safely pass the accented type
// names through a URL, so it sends these; anything else leaves the picker default.
const TYPE_ALIASES: Record<string, OrganizationType> = {
  pena: 'peña',
  asociacion: 'asociación',
  comision: 'comisión',
  otros: 'otros',
};

// Agrupaciones create surface: any member proposes a peña/comisión/asociación/otros;
// organizers create (auto-approved). After submit we return to the pueblo tab.
function VillageOrganizations() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { t } = useT();
  const initialType = type ? TYPE_ALIASES[type] : undefined;
  return (
    <Screen padded={false}>
      <ScreenHeader title={t('village.admin.organizations.add')} />
      {villageId ? (
        <OrganizationsManager
          villageId={villageId}
          initialType={initialType}
          onCreated={() => router.back()}
        />
      ) : null}
    </Screen>
  );
}

export default withVillageRoute(VillageOrganizations);
