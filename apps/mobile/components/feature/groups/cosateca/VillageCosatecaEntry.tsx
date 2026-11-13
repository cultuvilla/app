import { useMemo } from 'react';
import { router } from 'expo-router';
import { cosatecaCatalogue } from '@cultuvilla/shared/models/organization';
import { watchVillageCosas, type Cosa } from '@cultuvilla/shared/services/cosatecaService';
import { ActionPill, HStack } from '../../../primitives';
import { useWatch } from '../../../../lib/hooks/useWatch';
import { useT } from '../../../../lib/i18n';
import { villageSectionHref } from '../../../../lib/navigation/routes';

/**
 * The way into the Cosateca del pueblo from the village home, shown to a
 * member of the village only while some group has opened its cosateca to all
 * of them and has something in it. Nothing at all otherwise.
 */
export function VillageCosatecaEntry({
  municipalityId,
  villageSlug,
  isMember,
}: {
  municipalityId: string;
  villageSlug: string;
  isMember: boolean;
}) {
  const { t } = useT();
  const cosas = useWatch<Cosa[]>(
    'cosateca:watchVillageCosas',
    isMember ? municipalityId : null,
    isMember ? (next, error) => watchVillageCosas(municipalityId, next, error) : null,
  );
  const count = useMemo(() => cosatecaCatalogue(cosas.data ?? [], null).length, [cosas.data]);
  if (!isMember || count === 0) return null;
  return (
    <HStack gap={3} className="px-4 pt-8">
      <ActionPill
        testID="village-cosateca-entry"
        label={t('groups.cosateca.village.entry', { count })}
        onPress={() => router.push(villageSectionHref(villageSlug, 'cosateca'))}
      />
    </HStack>
  );
}
