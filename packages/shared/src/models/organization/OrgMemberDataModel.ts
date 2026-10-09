import { z } from 'zod';

export const OrgMemberRoleSchema = z.enum(['admin', 'member']);
export type OrgMemberRole = z.infer<typeof OrgMemberRoleSchema>;

/**
 * A member of an organization (peña/asociación/ayuntamiento).
 * Stored at /organizations/{orgId}/members/{userId}.
 */
export const OrgMemberDataSchema = z.object({
  // Denormalized so collection-group reverse lookups can filter by user.
  // Same value as the doc id (organizations/{orgId}/members/{userId}).
  userId: z.string(),
  joinedAt: z.date(),
  role: OrgMemberRoleSchema,
});
export type OrgMemberData = z.infer<typeof OrgMemberDataSchema>;

export interface OrgMemberDataInput {
  userId: string;
  joinedAt?: Date;
  role?: OrgMemberRole;
}

export function buildOrgMemberData(input: OrgMemberDataInput): OrgMemberData {
  return {
    userId: input.userId,
    joinedAt: input.joinedAt ?? new Date(),
    role: input.role ?? 'member',
  };
}

/**
 * True when `userId` is the org's only admin while other members remain — so
 * leaving would hand the group to nobody. They promote someone first. A sole
 * member may still leave: there is no one to promote, and the village admins
 * remain the backstop for the empty group.
 */
export function isSoleAdminWithOthers(
  members: readonly Pick<OrgMemberData, 'userId' | 'role'>[],
  userId: string,
): boolean {
  const admins = members.filter((m) => m.role === 'admin');
  return (
    admins.length === 1 &&
    admins[0]?.userId === userId &&
    members.some((m) => m.userId !== userId)
  );
}
