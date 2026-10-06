import { useEffect, useState } from 'react';
import { getVillagesWhereAmbassador } from '@cultuvilla/shared/services/municipalityService';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';

export interface AmbassadorVillage {
  id: string;
  name: string;
  sex: Sex | null;
}

/** Every pueblo whose Embajador title this user holds; empty for everyone else. */
export function useAmbassadorVillages(uid: string): AmbassadorVillage[] {
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
        // The title is decoration on a profile: a failed read must not break it.
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return villages;
}
