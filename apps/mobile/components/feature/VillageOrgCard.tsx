import type { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { OrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { EntityCard } from './VillageSections';
import { orgHref } from '../../lib/navigation/routes';
import { useT } from '../../lib/i18n';
import { useVillageRefs } from '../../lib/orgs/useVillageRefs';

const NONE: string[] = [];

/**
 * A group in a pueblo's group list. One from another pueblo, present here
 * because this pueblo accepted it, says where it is from and opens under its
 * home, where its page lives (docs/decisions/multi-village-groups.md).
 */
export function VillageOrgCard({
  org,
  villageId,
  villageSlug,
  sub,
  icon,
}: {
  org: OrganizationData & { id: string };
  villageId: string;
  villageSlug: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const { t } = useT();
  const visitor = org.municipalityId !== villageId;
  const [home] = useVillageRefs(visitor ? [org.municipalityId] : NONE);
  return (
    <EntityCard
      label={org.name}
      sub={visitor && home ? t('organization.villages.from', { village: home.name }) : sub}
      icon={icon}
      imageUri={org.images[0] ?? null}
      commentCount={org.commentCount}
      onPress={() => router.push(orgHref(visitor ? org : { ...org, villageSlug }))}
    />
  );
}
