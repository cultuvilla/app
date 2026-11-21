import { useMemo } from 'react';
import type { FiestaBlock, FiestaEdition, MunicipalityData } from '@cultuvilla/shared/models';
import { watchMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { watchFiestaEditions } from '@cultuvilla/shared/services/fiestaEditionService';
import { useWatch, type WatchStatus } from '../hooks/useWatch';
import { namedEditions, type NamedEdition } from './villageFiestas';

const NO_BLOCKS: FiestaBlock[] = [];

/**
 * A village's declared fiesta blocks and every edition dated for them, named
 * after their block — live, from the device cache first.
 */
export function useVillageFiestas(municipalityId: string | null): {
  fiestas: FiestaBlock[];
  editions: NamedEdition[];
  status: WatchStatus;
  error: Error | null;
} {
  const village = useWatch<(MunicipalityData & { id: string }) | null>('fiestas:watchMunicipality', municipalityId, (next, error) =>
    watchMunicipality(municipalityId ?? '', next, error),
  );
  const dated = useWatch<FiestaEdition[]>('fiestas:watchFiestaEditions', municipalityId, (next, error) =>
    watchFiestaEditions(municipalityId ?? '', next, error),
  );
  const fiestas = village.data?.community?.fiestas ?? NO_BLOCKS;
  const editions = useMemo(() => namedEditions(dated.data ?? [], fiestas), [dated.data, fiestas]);
  const status: WatchStatus =
    village.status === 'error' || dated.status === 'error'
      ? 'error'
      : village.status === 'loading' || dated.status === 'loading'
        ? 'loading'
        : 'ready';
  return { fiestas, editions, status, error: village.error ?? dated.error };
}
