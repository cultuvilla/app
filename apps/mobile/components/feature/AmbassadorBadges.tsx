import { VStack } from '../primitives';
import { VillageTitleBadge } from './VillageTitleBadge';
import type { AmbassadorVillage } from '../../lib/hooks/useAmbassadorVillages';

/**
 * "Embajador/a de Cultuvilla en {pueblo}" for every pueblo whose title this
 * user holds — the prestige line on a profile, visible to anyone who opens it.
 * Renders nothing for everyone else.
 */
export function AmbassadorBadges({ villages }: { villages: AmbassadorVillage[] }) {
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
