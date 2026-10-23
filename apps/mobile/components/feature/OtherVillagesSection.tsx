import { useMemo } from 'react';
import { router } from 'expo-router';
import { watchRankedVillages } from '@cultuvilla/shared/services/villageRankingService';
import {
  OTHER_VILLAGES_SHOWN,
  otherRankedVillages,
  type RankedVillage,
} from '@cultuvilla/shared/models/municipality/VillageRankingDataModel';
import { Section, EntityCard } from './VillageSections';
import { useWatch } from '../../lib/hooks/useWatch';
import { useT } from '../../lib/i18n';
import { routes, villageHref } from '../../lib/navigation/routes';

/**
 * Closes a village page with the pueblos that have the most to show, from the
 * nightly ranking — so a visitor who reaches the end has somewhere to go next.
 */
export function OtherVillagesSection({ municipalityId }: { municipalityId: string }) {
  const { t } = useT();
  const { data, status } = useWatch<RankedVillage[]>('villageHome:watchRankedVillages', 'top', watchRankedVillages);
  const villages = useMemo(
    () => otherRankedVillages(data ?? [], municipalityId, OTHER_VILLAGES_SHOWN),
    [data, municipalityId],
  );

  return (
    <Section
      title={t('village.otherVillages.title')}
      isEmpty={villages.length === 0}
      status={status}
      actionLabel={t('village.otherVillages.seeAll')}
      onManage={() => router.push(routes.discover)}
    >
      {villages.map((v) => (
        <EntityCard
          key={v.id}
          label={v.name}
          sub={v.province}
          icon="map-outline"
          imageUri={v.escudoUrl}
          crest={!v.manualEscudo}
          onPress={() => router.push(villageHref(v.slug))}
        />
      ))}
    </Section>
  );
}
