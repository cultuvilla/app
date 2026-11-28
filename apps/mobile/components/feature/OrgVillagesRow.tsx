import { router } from 'expo-router';
import type { OrganizationData } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { otherVillageIds } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { HStack, Pressable, Text } from '../primitives';
import { villageHref } from '../../lib/navigation/routes';
import { useT } from '../../lib/i18n';
import { useVillageRefs, type VillageRef } from '../../lib/orgs/useVillageRefs';

function VillageLink({ village, testID }: { village: VillageRef; testID: string }) {
  return (
    <Pressable
      onPress={() => router.push(villageHref(village.slug))}
      accessibilityRole="link"
      accessibilityLabel={village.name}
      testID={testID}
    >
      <Text variant="bodySm" tone="muted" style={{ textDecorationLine: 'underline' }}>
        {village.name}
      </Text>
    </Pressable>
  );
}

/**
 * Where a group is: its home pueblo, and the others it is listed in. Shown only
 * for a group present in more than one (docs/decisions/multi-village-groups.md).
 */
export function OrgVillagesRow({ org }: { org: Pick<OrganizationData, 'municipalityId' | 'municipalityIds'> }) {
  const { t } = useT();
  const others = otherVillageIds(org);
  const refs = useVillageRefs(others.length > 0 ? [org.municipalityId, ...others] : []);
  const home = refs.find((v) => v.id === org.municipalityId);
  const elsewhere = refs.filter((v) => v.id !== org.municipalityId);
  if (!home || elsewhere.length === 0) return null;
  return (
    <HStack gap={1} className="flex-wrap items-center" testID="org-villages-row">
      <Text variant="bodySm" tone="muted">
        {t('organization.villages.homeLabel')}
      </Text>
      <VillageLink village={home} testID="org-villages-home" />
      <Text variant="bodySm" tone="muted">
        {t('organization.villages.alsoInLabel')}
      </Text>
      {elsewhere.map((v, i) => (
        <HStack key={v.id} gap={0} className="items-center">
          <VillageLink village={v} testID={`org-villages-${v.id}`} />
          {i < elsewhere.length - 1 ? (
            <Text variant="bodySm" tone="muted">
              ,
            </Text>
          ) : null}
        </HStack>
      ))}
    </HStack>
  );
}
