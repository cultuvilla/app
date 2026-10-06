import { z } from 'zod';
import {
  ReviewStatusSchema,
  reviewDecisionFields,
  type ReviewStatus,
} from '../core/ReviewableDataModel';

export const OrganizationTypeSchema = z.enum(['ayuntamiento', 'peña', 'asociación', 'otros']);
export type OrganizationType = z.infer<typeof OrganizationTypeSchema>;

/**
 * Organization types a client may propose, in display order. `ayuntamiento`
 * is a singleton created via the requestAyuntamiento callable (handled
 * elsewhere), so it is excluded from the inline propose form.
 */
export const PROPOSABLE_ORGANIZATION_TYPES: readonly OrganizationType[] = [
  'peña',
  'asociación',
  'otros',
] as const;

/**
 * How people become members. `open`: anyone joins instantly (self-service).
 * `approval`: people ask, and an org admin admits them — the only kind of org
 * whose membership is vetted, so the only kind that may hold private events.
 */
export const OrgJoinPolicySchema = z.enum(['open', 'approval']);
export type OrgJoinPolicy = z.infer<typeof OrgJoinPolicySchema>;

export const OrganizationStatusSchema = ReviewStatusSchema;
export type OrganizationStatus = ReviewStatus;

export const OrganizationDataSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  /** Public download URLs for the organization's pictures (max 5). `images[0]`
   *  is the hero/cover shown in the detail scaffold. */
  images: z.array(z.string()).max(5),
  type: OrganizationTypeSchema,
  municipalityId: z.string(),
  /** The village's permanent URL slug, denormalized so a card can link without a read. */
  villageSlug: z.string(),
  requestedBy: z.string(),
  createdAt: z.date(),
  // Denormalized interaction counters, maintained server-side by the comments
  // Cloud Function trigger / the detail-screen view tracker. Initialized to 0
  // at create.
  commentCount: z.number().int(),
  readCount: z.number().int(),
  // Denormalized member count — kept in sync by
  // functions/src/organizations/syncOrgMemberCount.ts as members join/leave.
  // Lets the village hub order peñas/agrupaciones by size without an N+1
  // count-aggregate fan-out. Initialized to 0 at create (the founder is seeded
  // by approveOrganization, which fires the trigger).
  memberCount: z.number().int(),
  // When false, the member roster is shown only to joined members (admins
  // included); when true, it is shown to everyone. Display preference, not a
  // security boundary — member identities are world-readable. Default true.
  membersPublic: z.boolean(),
  // Defaults to `open` because installed binaries still create orgs without it
  // (the rules accept that too); existing docs are backfilled explicitly.
  joinPolicy: OrgJoinPolicySchema.default('open'),
  // status + reviewedBy + reviewedAt
  ...reviewDecisionFields,
});
export type OrganizationData = z.infer<typeof OrganizationDataSchema>;

export interface OrganizationDataInput {
  /** Optional caller-minted doc id (see newOrganizationId) — lets an image be
   * uploaded to the org's storage path before the doc is created. */
  id?: string;
  name: string;
  description?: string | null;
  images?: string[];
  type: OrganizationType;
  status?: OrganizationStatus;
  municipalityId: string;
  villageSlug: string;
  requestedBy: string;
  reviewedBy?: string | null;
  createdAt?: Date;
  reviewedAt?: Date | null;
  membersPublic?: boolean;
  joinPolicy?: OrgJoinPolicy;
}

export function buildOrganizationData(input: OrganizationDataInput): OrganizationData {
  return {
    name: input.name,
    description: input.description ?? null,
    images: input.images ?? [],
    type: input.type,
    status: input.status ?? 'pending',
    municipalityId: input.municipalityId,
    villageSlug: input.villageSlug,
    requestedBy: input.requestedBy,
    reviewedBy: input.reviewedBy ?? null,
    createdAt: input.createdAt ?? new Date(),
    reviewedAt: input.reviewedAt ?? null,
    commentCount: 0,
    readCount: 0,
    memberCount: 0,
    membersPublic: input.membersPublic ?? true,
    joinPolicy: input.joinPolicy ?? 'open',
  };
}

/**
 * Whether a given viewer may see an org's member roster. Public groups are
 * visible to everyone; private groups only to joined members (admins are
 * members, so they always see it). Pure — the UI-level display gate.
 */
export function canViewOrgRoster({
  membersPublic,
  isMember,
}: {
  membersPublic: boolean;
  isMember: boolean;
}): boolean {
  return membersPublic || isMember;
}
