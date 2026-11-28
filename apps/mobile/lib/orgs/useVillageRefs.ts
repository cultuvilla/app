import { useMemo } from 'react';
import { watchMunicipalitiesByIds } from '@cultuvilla/shared/services/municipalityService';
import type { MunicipalityData } from '@cultuvilla/shared/models/municipality/MunicipalityDataModel';
import { useWatch } from '../hooks/useWatch';

export type VillageRef = { id: string; name: string; slug: string };

/**
 * The pueblos behind a set of ids, live, in the order given (unknown ones
 * dropped) — for a group present in several pueblos, which stores only ids.
 */
export function useVillageRefs(ids: readonly string[]): VillageRef[] {
  const unique = useMemo(() => [...new Set(ids)], [ids]);
  const key = unique.length > 0 ? unique.join(',') : null;
  const villages = useWatch<(MunicipalityData & { id: string })[]>(
    'orgs:watchMunicipalitiesByIds',
    key,
    key ? (next, error) => watchMunicipalitiesByIds(unique, next, error) : null,
  );
  return useMemo(
    () => (villages.data ?? []).map((m) => ({ id: m.id, name: m.name, slug: m.slug })),
    [villages.data],
  );
}
