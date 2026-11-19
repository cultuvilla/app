import { z } from 'zod';
import { GroupMessageAudienceKindSchema, GroupPollSchema } from './GroupMessageDataModel';
import { OrgAdminTitleSchema } from './SocioDataModel';
import type { CuotaStatus } from './cuotaStatus';

/**
 * `organizations.transparency`: what a group's junta opens to every integrante,
 * one switch each, for groups with a socio roster. All off by default, so a
 * group shows its socios nothing new until its junta decides to.
 *
 * - `cuota` — the socios of the current period, each one's name and whether
 *   they are al día. Never amounts, dates, methods or receipts.
 * - `avisos` — every aviso the junta sent, whoever it went to, and its poll's
 *   results. Never who read it, nor who voted what.
 * - `cuentas` — the year's accounts: the ledger read-only, and the cuota's
 *   income as totals per period.
 *
 * Contact data is never part of any of them. The cuota and the avisos hold
 * fields socios must not see (amounts, `recipientUids`, per-account votes), so
 * the rules cannot open them; the `getGroupTransparency` callable reads them
 * with the Admin SDK and returns only the safe fields. The ledger has nothing
 * to hide, so the rules open it directly while `cuentas` is on.
 */
export const GroupTransparencySchema = z.object({
  cuota: z.boolean(),
  avisos: z.boolean(),
  cuentas: z.boolean(),
});
export type GroupTransparency = z.infer<typeof GroupTransparencySchema>;
export type GroupTransparencyView = keyof GroupTransparency;

export const DEFAULT_GROUP_TRANSPARENCY: GroupTransparency = { cuota: false, avisos: false, cuentas: false };

/** How many avisos the members' archive shows, newest first. */
export const TRANSPARENT_AVISOS_LIMIT = 50;

export const GetGroupTransparencyInputSchema = z.discriminatedUnion('view', [
  z.object({ orgId: z.string().min(1), view: z.literal('cuota') }),
  z.object({ orgId: z.string().min(1), view: z.literal('avisos') }),
  z.object({ orgId: z.string().min(1), view: z.literal('cuentas'), year: z.string().regex(/^\d{4}$/) }),
]);
export type GetGroupTransparencyInput = z.infer<typeof GetGroupTransparencyInputSchema>;

/** A socio's cuota as the other socios see it: vencida and pendiente are both just pendiente. */
export type PublicCuotaStatus = 'al_dia' | 'pendiente';

export function publicCuotaStatus(status: CuotaStatus): PublicCuotaStatus {
  return status === 'al_dia' ? 'al_dia' : 'pendiente';
}

export interface TransparentCuotaRow {
  socioId: string;
  displayName: string;
  status: PublicCuotaStatus;
}

export interface TransparentCuotaResult {
  view: 'cuota';
  /** Null while the junta has not configured the cuota. */
  periodKey: string | null;
  socios: TransparentCuotaRow[];
}

export const TransparentAvisoSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  audienceKind: GroupMessageAudienceKindSchema,
  eventTitle: z.string().nullable(),
  signerName: z.string(),
  signerTitle: OrgAdminTitleSchema.nullable(),
  /** ISO instant: a callable's response is JSON. */
  sentAt: z.string(),
  poll: GroupPollSchema.nullable(),
  /** Votes per option, in the poll's order; null without a poll. */
  tally: z.array(z.number().int().min(0)).nullable(),
});
export type TransparentAviso = z.infer<typeof TransparentAvisoSchema>;

export interface TransparentAvisosResult {
  view: 'avisos';
  avisos: TransparentAviso[];
}

export interface TransparentCuentasResult {
  view: 'cuentas';
  year: string;
  /** Cuota money paid in the year (net of anulaciones), per period it paid for. */
  cuotaByPeriod: { periodKey: string; cents: number }[];
  cuotaCents: number;
}

export type GetGroupTransparencyResult = TransparentCuotaResult | TransparentAvisosResult | TransparentCuentasResult;
