import type { Sex } from '../core/SexModel';
import type { VillageMemberRole } from './VillageMemberDataModel';

/**
 * The public title a village member carries. Authority is the `role` flag;
 * the title is presentation on top of it:
 *
 * - `ambassador` — the one admin `community.organizerId` points at. Shown as
 *   "Embajador/Embajadora de Cultuvilla en {pueblo}".
 * - `team` — every other admin ("Equipo del pueblo"): same permissions, lower
 *   profile, so the Embajador title stays one per pueblo.
 * - `member` — everyone else.
 *
 * See docs/decisions/embajador-title.md.
 */
export type VillageTitle = 'ambassador' | 'team' | 'member';

export function villageTitle(input: {
  userId: string;
  role: VillageMemberRole;
  organizerId: string | null;
}): VillageTitle {
  if (input.role !== 'admin') return 'member';
  return input.userId === input.organizerId ? 'ambassador' : 'team';
}

/**
 * i18n key for the Embajador/Embajadora title. Spanish has no neutral form, so
 * anything but `female` takes the masculine.
 */
export function ambassadorTitleKey(
  sex: Sex | null,
  variant: 'short' | 'inVillage' = 'short',
): string {
  const base = variant === 'inVillage' ? 'ambassador.inVillage' : 'ambassador.title';
  return sex === 'female' ? `${base}Female` : base;
}
