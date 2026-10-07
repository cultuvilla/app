import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import type { FiestaBlock } from '@cultuvilla/shared/models';
import { getVillageWrappedForYear, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { fiestaMovement, type MovementEvent } from '@cultuvilla/shared/wrapped';
import { Button, HStack, Text, VStack } from '../../primitives';
import { villageSectionHref } from '../../../lib/navigation/routes';
import { withFirestoreErrorLog } from '../../../lib/firestoreErrorLog';
import { useT } from '../../../lib/i18n';

type Props = {
  municipalityId: string;
  villageSlug: string;
  events: readonly MovementEvent[];
  fiestas: readonly FiestaBlock[];
};

/**
 * The village admin's invitation to sum up the fiestas, shown on the village
 * home once the village has had movement worth summing up (`fiestaMovement`).
 * Leads into the create/review screen, which asks for the fiestas first when
 * the village has none. Goes away once that year's Wrapped is published, or
 * discarded — a discard is the admin saying "not this year".
 *
 * Render it for admins only: the year's Wrapped read includes drafts, which
 * the rules show to nobody else.
 */
export function WrappedPrompt({ municipalityId, villageSlug, events, fiestas }: Props) {
  const { t } = useT();
  const movement = useMemo(() => fiestaMovement(events, fiestas, new Date()), [events, fiestas]);
  const year = movement?.year ?? null;
  const [existing, setExisting] = useState<VillageWrapped | null | undefined>(undefined);

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    setExisting(undefined);
    withFirestoreErrorLog('villageHome:getVillageWrappedForYear', () => getVillageWrappedForYear(municipalityId, year))
      .then((w) => {
        if (!cancelled) setExisting(w);
      })
      .catch(() => {
        // An invitation, not a feature: a failed read keeps it hidden
        // (a denial is already reported by withFirestoreErrorLog).
      });
    return () => {
      cancelled = true;
    };
  }, [municipalityId, year]);

  if (!movement || existing === undefined) return null;
  if (existing && existing.status !== 'draft') return null;

  const draft = existing?.status === 'draft';
  const yearText = String(movement.year);
  return (
    <VStack gap={2} className="mx-4 mt-4 rounded-md border border-subtle bg-surface-elevated p-4" testID="wrapped-prompt">
      <HStack gap={2} className="items-center">
        <Ionicons name="sparkles-outline" size={iconSizes.md} color={colors.light.fg.muted} />
        <Text className="flex-1 font-semibold">
          {draft ? t('village.wrapped.prompt.draftTitle', { year: yearText }) : t('village.wrapped.prompt.title', { year: yearText })}
        </Text>
      </HStack>
      <Text variant="bodySm" tone="muted">
        {draft
          ? t('village.wrapped.prompt.draftBody')
          : t('village.wrapped.prompt.body', { events: String(movement.eventCount) })}
      </Text>
      <Button
        onPress={() => router.push(villageSectionHref(villageSlug, 'resumen', `year=${yearText}`))}
        fullWidth
        testID="wrapped-prompt-action"
      >
        {draft ? t('village.wrapped.prompt.review') : t('village.wrapped.prompt.create')}
      </Button>
    </VStack>
  );
}
