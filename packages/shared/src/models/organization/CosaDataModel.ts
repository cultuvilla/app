import { z } from 'zod';
import { DayKeySchema } from '../municipality/FiestaBlockModel';

/**
 * The cosateca: what a group's people lend, offer and give to each other. See
 * docs/plans/ongoing/cosateca.md.
 *
 * `cosas/{cosaId}` is top-level and scoped by `municipalityId` (invariant 3): a
 * cosateca open to the pueblo is read across groups, by `municipalityId` and
 * `audience`. A cosa belongs to one group (`orgId`). Its owner is an integrante
 * (`ownerUid`) or the group itself (`ownerUid: null`, managed by its admins).
 *
 * Two fields are function-owned:
 * - `audience`, the group's effective audience, rewritten by `syncCosaAudience`
 *   when the group changes its cosateca setting. The rules read it, so a cosa of
 *   an integrantes-only group is never visible to the rest of the pueblo.
 * - `heldBy`, who has it now: set when a request is lent, cleared when it comes
 *   back (`respondToCosaRequest`).
 */

export const CosaKindSchema = z.enum(['prestamo', 'servicio', 'regalo']);
export type CosaKind = z.infer<typeof CosaKindSchema>;

export const COSA_CATEGORIES = ['herramientas', 'cocina', 'fiestas', 'deporte', 'ninos', 'jardin', 'libros', 'otros'] as const;
export const CosaCategorySchema = z.enum(COSA_CATEGORIES);
export type CosaCategory = z.infer<typeof CosaCategorySchema>;

export const CosatecaAudienceSchema = z.enum(['integrantes', 'pueblo']);
export type CosatecaAudience = z.infer<typeof CosatecaAudienceSchema>;

/** `organizations.cosateca`: the admin's switch and who the cosateca is for. */
export const CosatecaSettingsSchema = z.object({
  enabled: z.boolean(),
  audience: CosatecaAudienceSchema,
});
export type CosatecaSettings = z.infer<typeof CosatecaSettingsSchema>;

export const DEFAULT_COSATECA_SETTINGS: CosatecaSettings = { enabled: false, audience: 'integrantes' };

/** The audience a group's cosas carry: the pueblo only while the cosateca is on and open to it. */
export function effectiveCosaAudience(settings: CosatecaSettings): CosatecaAudience {
  return settings.enabled && settings.audience === 'pueblo' ? 'pueblo' : 'integrantes';
}

/** `available` takes requests; `paused` keeps it listed but closed; `given` is a regalo that has gone. */
export const CosaStatusSchema = z.enum(['available', 'paused', 'given']);
export type CosaStatus = z.infer<typeof CosaStatusSchema>;

export const CosaHeldBySchema = z.object({
  requestId: z.string().min(1),
  uid: z.string().min(1),
  /** The holder's name when it was lent. */
  name: z.string(),
  untilOn: DayKeySchema.nullable(),
});
export type CosaHeldBy = z.infer<typeof CosaHeldBySchema>;

export const MAX_COSA_TITLE = 80;
export const MAX_COSA_DESCRIPTION = 1000;
export const MAX_COSA_CONDITIONS = 300;

export const CosaDataSchema = z.object({
  municipalityId: z.string().min(1),
  orgId: z.string().min(1),
  audience: CosatecaAudienceSchema,
  ownerUid: z.string().min(1).nullable(),
  /** The owner's public name (or the group's) when it was offered. */
  ownerName: z.string(),
  kind: CosaKindSchema,
  title: z.string().min(1).max(MAX_COSA_TITLE),
  description: z.string().max(MAX_COSA_DESCRIPTION).nullable(),
  category: CosaCategorySchema,
  imageURL: z.string().nullable(),
  /** Free text: "devolver limpia". No money, ever. */
  conditions: z.string().max(MAX_COSA_CONDITIONS).nullable(),
  status: CosaStatusSchema,
  heldBy: CosaHeldBySchema.nullable(),
  createdBy: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CosaData = z.infer<typeof CosaDataSchema>;

/** What an integrante (or an admin, for the group) fills in. */
export const CosaEditSchema = CosaDataSchema.pick({
  kind: true,
  title: true,
  description: true,
  category: true,
  imageURL: true,
  conditions: true,
  status: true,
});
export type CosaEdit = z.infer<typeof CosaEditSchema>;

export interface CosaInput {
  municipalityId: string;
  orgId: string;
  audience: CosatecaAudience;
  ownerUid: string | null;
  ownerName: string;
  kind: CosaKind;
  title: string;
  description?: string | null;
  category: CosaCategory;
  imageURL?: string | null;
  conditions?: string | null;
  createdBy: string;
  createdAt?: Date;
}

export function buildCosaData(input: CosaInput): CosaData {
  const now = input.createdAt ?? new Date();
  return {
    municipalityId: input.municipalityId,
    orgId: input.orgId,
    audience: input.audience,
    ownerUid: input.ownerUid,
    ownerName: input.ownerName,
    kind: input.kind,
    title: input.title.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    category: input.category,
    imageURL: input.imageURL ?? null,
    conditions: input.conditions?.trim() ? input.conditions.trim() : null,
    status: 'available',
    heldBy: null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}
