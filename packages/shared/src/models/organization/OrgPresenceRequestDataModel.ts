import { z } from 'zod';

/**
 * A group's request to be listed in a pueblo other than its own.
 * Stored at /organizations/{orgId}/presenceRequests/{municipalityId} — one per
 * pueblo asked. A group admin files and withdraws it; that pueblo's Equipo (or
 * an app admin) resolves it through the respondToOrgPresenceRequest callable,
 * which deletes it. See docs/decisions/multi-village-groups.md.
 */
export const OrgPresenceRequestDataSchema = z.object({
  orgId: z.string(),
  /** The pueblo asked — the doc id, denormalized for its Equipo's collection-group query. */
  municipalityId: z.string(),
  /** The group's home pueblo, so the Equipo sees where it comes from without a read. */
  homeMunicipalityId: z.string(),
  orgName: z.string(),
  requestedBy: z.string(),
  createdAt: z.date(),
});
export type OrgPresenceRequestData = z.infer<typeof OrgPresenceRequestDataSchema>;

export function buildOrgPresenceRequestData(input: {
  orgId: string;
  municipalityId: string;
  homeMunicipalityId: string;
  orgName: string;
  requestedBy: string;
  createdAt?: Date;
}): OrgPresenceRequestData {
  return {
    orgId: input.orgId,
    municipalityId: input.municipalityId,
    homeMunicipalityId: input.homeMunicipalityId,
    orgName: input.orgName,
    requestedBy: input.requestedBy,
    createdAt: input.createdAt ?? new Date(),
  };
}
