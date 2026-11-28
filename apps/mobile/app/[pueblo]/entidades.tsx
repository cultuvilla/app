import { useVillageRoute, withVillageRoute } from '../../lib/navigation/VillageRouteGate';
import { useLocalSearchParams, router } from 'expo-router';
import { Screen } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useT } from '../../lib/i18n';
import { OrganizationsManager } from '../../components/feature/proposable/OrganizationsManager';
import {
  PROPOSABLE_ORGANIZATION_TYPES,
  orgTypeFromQuery,
  type OrganizationType,
} from '@cultuvilla/shared/models/organization/OrganizationDataModel';

// The `type` query preselects the picker; a type nobody may propose (or an
// unknown value) leaves the picker default.
function proposableTypeFromQuery(value: string | undefined): OrganizationType | undefined {
  const parsed = orgTypeFromQuery(value);
  return parsed && PROPOSABLE_ORGANIZATION_TYPES.includes(parsed) ? parsed : undefined;
}

// Agrupaciones create surface: any member proposes a peña/comisión/asociación/otros;
// organizers create (auto-approved). After submit we return to the pueblo tab.
function VillageOrganizations() {
  const { municipalityId: villageId, slug: villageSlug } = useVillageRoute();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { t } = useT();
  const initialType = proposableTypeFromQuery(type);
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
