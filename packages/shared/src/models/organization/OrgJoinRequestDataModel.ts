import { z } from 'zod';

/**
 * A pending request to join an organization whose `joinPolicy` is `approval`.
 * Stored at /organizations/{orgId}/joinRequests/{userId} — one per requester.
 * The requester files and withdraws it; an org admin resolves it through the
 * respondToOrgJoinRequest callable, which deletes it.
 */
export const OrgJoinRequestDataSchema = z.object({
  // Same value as the doc id; denormalized for the requester's
  // collection-group lookup of their own requests.
  userId: z.string(),
  orgId: z.string(),
  municipalityId: z.string(),
  createdAt: z.date(),
});
export type OrgJoinRequestData = z.infer<typeof OrgJoinRequestDataSchema>;

export function buildOrgJoinRequestData(input: {
  userId: string;
  orgId: string;
  municipalityId: string;
  createdAt?: Date;
}): OrgJoinRequestData {
  return {
    userId: input.userId,
    orgId: input.orgId,
    municipalityId: input.municipalityId,
    createdAt: input.createdAt ?? new Date(),
  };
}
