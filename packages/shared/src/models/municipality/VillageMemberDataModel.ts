import { z } from 'zod';

export const VillageMemberRoleSchema = z.enum(['admin', 'user']);
export type VillageMemberRole = z.infer<typeof VillageMemberRoleSchema>;

/**
 * A member of the community living on a municipality.
 * Stored at /municipalities/{municipalityId}/members/{userId}.
 *
 * Residence barrio is NOT here — it lives solely on the linked person's
 * `persons.municipalityLinks` (the query surface for `getPersonsByBarrio`),
 * written directly by the owner. See docs/decisions/per-village-barrio-membership.md.
 */
export const VillageMemberDataSchema = z.object({
  // Denormalized so collection-group reverse lookups can filter by user.
  // Same value as the doc id (municipalities/{municipalityId}/members/{userId}).
  userId: z.string(),
  role: VillageMemberRoleSchema,
  joinedAt: z.date(),
  // Always `{}`. Census answers moved to censoAnswers/ (this doc is
  // world-readable); the key stays only because store binaries that predate
  // the move require it to parse the doc. Drop it once
  // config/appVersion.minSupported is past those builds.
  profileAnswers: z.object({}).strict(),
  profileCompletedAt: z.date().nullable(),
});
export type VillageMemberData = z.infer<typeof VillageMemberDataSchema>;

export interface VillageMemberDataInput {
  userId: string;
  role?: VillageMemberRole;
  joinedAt?: Date;
  profileCompletedAt?: Date | null;
}

export function buildVillageMemberData(input: VillageMemberDataInput): VillageMemberData {
  return {
    userId: input.userId,
    role: input.role ?? 'user',
    joinedAt: input.joinedAt ?? new Date(),
    profileAnswers: {},
    profileCompletedAt: input.profileCompletedAt ?? null,
  };
}
