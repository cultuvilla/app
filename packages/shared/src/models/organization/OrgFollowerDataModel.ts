import { z } from 'zod';

/**
 * Someone following an organization — a seguidor. Stored at
 * /organizations/{orgId}/followers/{userId}, one per user. A free tap with no
 * approval and no tie to the roster: a seguidor hears about the group's public
 * events and is not in its libro de socios. An integrante is at `members/` instead.
 */
export const OrgFollowerDataSchema = z.object({
  // Same value as the doc id; denormalized so deleting an account can find
  // their follows across every org.
  userId: z.string(),
  orgId: z.string(),
  municipalityId: z.string(),
  createdAt: z.date(),
});
export type OrgFollowerData = z.infer<typeof OrgFollowerDataSchema>;

export function buildOrgFollowerData(input: {
  userId: string;
  orgId: string;
  municipalityId: string;
  createdAt?: Date;
}): OrgFollowerData {
  return {
    userId: input.userId,
    orgId: input.orgId,
    municipalityId: input.municipalityId,
    createdAt: input.createdAt ?? new Date(),
  };
}
