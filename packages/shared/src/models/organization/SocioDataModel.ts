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

/** How a title reads under a signature. Display only, like the title itself. */
export const ORG_ADMIN_TITLE_SIGNATURE: Record<OrgAdminTitle, string> = {
  presidente: 'Presidencia',
  secretario: 'Secretaría',
  tesorero: 'Tesorería',
  vocal: 'Vocal',
  otro: 'Junta',
};

/**
 * One socio of a group, at `organizations/{orgId}/socios/{socioId}`. Holds no
 * contact data: phone and email live in `socioPrivate/{socioId}`, which only the
 * org's admins (and the socio themself) may read. A socio who leaves keeps the
 * row with a `bajaAt`; rows are never deleted, so the roster doubles as the
 * libro de socios.
 */
/** Highest socio number an admin may set — a village group's libro never nears it. */
export const SOCIO_NUMBER_MAX = 99999;

export const SocioNumberSchema = z.number().int().min(1).max(SOCIO_NUMBER_MAX);

export const SocioDataSchema = z.object({
  kind: SocioKindSchema,
  /** The group's own "nº de socio". Never reused: a baja keeps its number. Set
   * by an admin (or the import), else the next one by `assignSocioNumber` when
   * the row is created. Null on rows that predate numbering until an admin
   * gives them one. Admins see to uniqueness; rules cannot. */
  socioNumber: SocioNumberSchema.nullable(),
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
  /** On a `member` row: the `joinedAt` of the membership it belongs to. A row
   * whose stamp differs from the member doc's is a previous membership's, so
   * the roster trigger can tell a rejoin from a late-delivered event. Null on
   * persona and typed rows. */
  memberJoinedAt: z.date().nullable(),
  createdBy: z.string(),
});
export type SocioData = z.infer<typeof SocioDataSchema>;

export interface SocioDataInput {
  kind: SocioKind;
  socioNumber?: number | null;
  displayName: string;
  uid?: string | null;
  personId?: string | null;
  responsibleUid?: string | null;
  adminTitle?: OrgAdminTitle | null;
  altaAt?: Date;
  memberJoinedAt?: Date | null;
  createdBy: string;
}

export function buildSocioData(input: SocioDataInput): SocioData {
  return {
    kind: input.kind,
    socioNumber: input.socioNumber ?? null,
    displayName: input.displayName.trim(),
    uid: input.uid ?? null,
    personId: input.personId ?? null,
    responsibleUid: input.responsibleUid ?? null,
    adminTitle: input.adminTitle ?? null,
    altaAt: input.altaAt ?? new Date(),
    bajaAt: null,
    memberJoinedAt: input.memberJoinedAt ?? null,
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

/**
 * While a persona is an active socio, `organizations/{orgId}/socioPersonaLocks/{personId}`
 * names its row. Created with the row and deleted with its baja, in the same
 * write; rules refuse a second create, so two devices adding the same persona
 * cannot both succeed, and a persona can be re-added once the lock is gone —
 * the old row and its baja stay in the libro.
 */
export const SocioPersonaLockDataSchema = z.object({
  socioId: z.string(),
});
export type SocioPersonaLockData = z.infer<typeof SocioPersonaLockDataSchema>;

/**
 * `organizations/{orgId}/socioNumbering/current` — the last number
 * `assignSocioNumber` handed out. Function-owned. Its write is what serializes
 * two rows created at once, so they never get the same number.
 */
export const SocioNumberingDataSchema = z.object({
  lastNumber: z.number().int().min(0),
});
export type SocioNumberingData = z.infer<typeof SocioNumberingDataSchema>;

/**
 * The number a new row gets: one past both the counter and the highest number
 * on the roster (an admin or the import may have set a higher one by hand).
 */
export function nextSocioNumber(lastNumber: number, highestOnRoster: number | null): number {
  return Math.max(lastNumber, highestOnRoster ?? 0) + 1;
}

/** An admin's typing → a socio number, null for blank, undefined when not a valid number. */
export function parseSocioNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return SocioNumberSchema.safeParse(n).success ? n : undefined;
}

/** Whether another row already carries this number (bajas included: numbers are never reused). */
export function socioNumberTaken(
  rows: readonly (Pick<SocioData, 'socioNumber'> & { id: string })[],
  socioNumber: number,
  exceptId: string | null,
): boolean {
  return rows.some((r) => r.id !== exceptId && r.socioNumber === socioNumber);
}

export function isActiveSocio(socio: Pick<SocioData, 'bajaAt'>): boolean {
  return socio.bajaAt === null;
}

/** Org kinds that keep a socio roster. The ayuntamiento has vecinos, not socios. */
export const SOCIO_ROSTER_ORG_TYPES: readonly OrganizationType[] = ['peña', 'asociación', 'otros'];

export function hasSocioRoster(type: OrganizationType): boolean {
  return SOCIO_ROSTER_ORG_TYPES.includes(type);
}
