import { z } from 'zod';
import type { OrganizationType } from './OrganizationDataModel';

/**
 * The three ways someone is on a group's socio roster:
 * - `member`: an app user who joined the org — one row per
 *   `organizations/{orgId}/members/{uid}`, kept in step by the
 *   `syncOrgSocioRoster` trigger (alta on join, baja on leave).
 * - `persona`: a member's persona a cargo (a `persons` doc they created), added
 *   by that member; messages and reminders for it go to `responsibleUid`.
 * - `typed`: typed in by an admin for someone who never installs the app. An
 *   admin later merges it into the member's row with `linkSocioToMember`.
 */
export const SocioKindSchema = z.enum(['member', 'persona', 'typed']);
export type SocioKind = z.infer<typeof SocioKindSchema>;

/** Display-only title an org admin may carry. Grants no powers. */
export const OrgAdminTitleSchema = z.enum(['presidente', 'secretario', 'tesorero', 'vocal', 'otro']);
export type OrgAdminTitle = z.infer<typeof OrgAdminTitleSchema>;
export const ORG_ADMIN_TITLES: readonly OrgAdminTitle[] = OrgAdminTitleSchema.options;

/**
 * One socio of a group, at `organizations/{orgId}/socios/{socioId}`. Holds no
 * contact data: phone and email live in `socioPrivate/{socioId}`, which only the
 * org's admins (and the socio themself) may read. A socio who leaves keeps the
 * row with a `bajaAt`; rows are never deleted, so the roster doubles as the
 * libro de socios.
 */
export const SocioDataSchema = z.object({
  kind: SocioKindSchema,
  /** Point-in-time copy of the name, like a registration's — a private persona's
   * doc is unreadable to the admins who list the roster. */
  displayName: z.string(),
  /** The socio's account: set on `member` rows, null otherwise. */
  uid: z.string().nullable(),
  /** The socio's `persons` doc when known: the persona on a `persona` row, the
   * member's own profile on a `member` row. */
  personId: z.string().nullable(),
  /** The member answerable for a `persona` row. */
  responsibleUid: z.string().nullable(),
  /** Only on a `member` row whose member is an org admin. */
  adminTitle: OrgAdminTitleSchema.nullable(),
  altaAt: z.date(),
  bajaAt: z.date().nullable(),
  createdBy: z.string(),
});
export type SocioData = z.infer<typeof SocioDataSchema>;

export interface SocioDataInput {
  kind: SocioKind;
  displayName: string;
  uid?: string | null;
  personId?: string | null;
  responsibleUid?: string | null;
  adminTitle?: OrgAdminTitle | null;
  altaAt?: Date;
  createdBy: string;
}

export function buildSocioData(input: SocioDataInput): SocioData {
  return {
    kind: input.kind,
    displayName: input.displayName.trim(),
    uid: input.uid ?? null,
    personId: input.personId ?? null,
    responsibleUid: input.responsibleUid ?? null,
    adminTitle: input.adminTitle ?? null,
    altaAt: input.altaAt ?? new Date(),
    bajaAt: null,
    createdBy: input.createdBy,
  };
}

/**
 * A socio's contact data, at `organizations/{orgId}/socioPrivate/{socioId}`.
 * Readable by the org's admins and the socio; never copied from or to `persons`
 * (a public genealogy record) or `users`.
 *
 * On a `member` row it is written by the member, who chooses what the junta may
 * see: a null field is one they chose not to share, and `consentAnsweredAt`
 * says they answered. On a `typed` row an admin writes it and
 * `consentAnsweredAt` stays null.
 */
export const SocioPrivateDataSchema = z.object({
  phone: z.string().nullable(),
  email: z.string().nullable(),
  consentAnsweredAt: z.date().nullable(),
});
export type SocioPrivateData = z.infer<typeof SocioPrivateDataSchema>;

export interface SocioPrivateDataInput {
  phone?: string | null;
  email?: string | null;
  consentAnsweredAt?: Date | null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function buildSocioPrivateData(input: SocioPrivateDataInput): SocioPrivateData {
  return {
    phone: blankToNull(input.phone),
    email: blankToNull(input.email),
    consentAnsweredAt: input.consentAnsweredAt ?? null,
  };
}

export function isActiveSocio(socio: Pick<SocioData, 'bajaAt'>): boolean {
  return socio.bajaAt === null;
}

/** Org kinds that keep a socio roster. The ayuntamiento has vecinos, not socios. */
export const SOCIO_ROSTER_ORG_TYPES: readonly OrganizationType[] = ['peña', 'asociación', 'otros'];

export function hasSocioRoster(type: OrganizationType): boolean {
  return SOCIO_ROSTER_ORG_TYPES.includes(type);
}
