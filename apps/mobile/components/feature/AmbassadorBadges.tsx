import { useEffect, useState } from 'react';
import { getVillagesWhereAmbassador } from '@cultuvilla/shared/services/municipalityService';
import { VStack } from '../primitives';
import { VillageTitleBadge } from './VillageTitleBadge';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';

interface AmbassadorVillage {
  id: string;
  name: string;
  sex: Sex | null;
}

/**
 * "Embajador/a de Cultuvilla en {pueblo}" for every pueblo whose title this
 * user holds — the prestige line on a profile, visible to anyone who opens it.
 * Renders nothing for everyone else.
 */
export function AmbassadorBadges({ uid }: { uid: string }) {
  const [villages, setVillages] = useState<AmbassadorVillage[]>([]);

  useEffect(() => {
    let cancelled = false;
    getVillagesWhereAmbassador(uid)
      .then((rows) => {
        if (cancelled) return;
        setVillages(
          rows.map((m) => ({ id: m.id, name: m.name, sex: m.community?.organizerSex ?? null })),
        );
      })
      .catch(() => {
        // A badge is decoration: a failed read must not break the profile.
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (villages.length === 0) return null;
  return (
    <VStack gap={2} className="px-4 pt-3">
      {villages.map((v) => (
        <VillageTitleBadge
          key={v.id}
          title="ambassador"
          sex={v.sex}
          village={v.name}
          testID={`ambassador-badge-${v.id}`}
        />
      ))}
    </VStack>
  );
}
