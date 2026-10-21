import { z } from 'zod';
import { DayKeySchema } from '../municipality/FiestaBlockModel';

/**
 * The records a group with a socio roster keeps (Phase 5 of the group
 * toolkit): the actas of its meetings and the other money it takes in or pays
 * out. The libro de socios needs no collection of its own — the socio roster
 * never deletes a row, so it already is one.
 *
 * - `actas/{actaId}` — one meeting: who met, where, the agenda and what was
 *   agreed. Admins write; socios read only the ones marked visible.
 * - `ledgerEntries/{entryId}` — append-only income/expense entries beyond the
 *   cuota (which has its own ledger, `cuotaPayments`). A mistake is cancelled
 *   by a reversal at `rev_<entryId>`, never edited away.
 */

// ── Actas ────────────────────────────────────────────────────────────────────

export const ActaBodySchema = z.enum(['asamblea_general', 'junta_directiva', 'otro']);
export type ActaBody = z.infer<typeof ActaBodySchema>;
export const ACTA_BODIES: readonly ActaBody[] = ActaBodySchema.options;

export const MAX_ACTA_ITEMS = 50;
export const MAX_ACTA_ATTENDEES = 500;

/** A socio who attended, with the name as it was that day. */
export const ActaAttendeeSchema = z.object({
  socioId: z.string().min(1),
  name: z.string().min(1).max(200),
});
export type ActaAttendee = z.infer<typeof ActaAttendeeSchema>;

export const ActaDataSchema = z.object({
  body: ActaBodySchema,
  /** Optional heading, e.g. "Asamblea extraordinaria". */
  title: z.string().max(120).nullable(),
  /** The day the meeting was held (Madrid). */
  heldOn: DayKeySchema,
  place: z.string().max(200).nullable(),
  /** Socios present, picked from the roster. */
  attendees: z.array(ActaAttendeeSchema).max(MAX_ACTA_ATTENDEES),
  /** People present who are not on the roster, by count. */
  otherAttendees: z.number().int().min(0).max(10_000),
  agenda: z.array(z.string().min(1).max(300)).max(MAX_ACTA_ITEMS),
  agreements: z.array(z.string().min(1).max(1000)).max(MAX_ACTA_ITEMS),
  /** Off by default: only admins read an acta until one shares it with the socios. */
  visibleToSocios: z.boolean(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type ActaData = z.infer<typeof ActaDataSchema>;

/** What an admin edits; the authorship stamps are the service's. */
export interface ActaInput {
  body: ActaBody;
  title?: string | null;
  heldOn: string;
  place?: string | null;
  attendees?: ActaAttendee[];
  otherAttendees?: number;
  agenda?: string[];
  agreements?: string[];
  visibleToSocios?: boolean;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function cleanItems(items: string[] | undefined): string[] {
  return (items ?? []).map((i) => i.trim()).filter((i) => i !== '');
}

/** The editable fields, trimmed — shared by a create and an update. */
export function buildActaFields(input: ActaInput): Omit<ActaData, 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'> {
  const seen = new Set<string>();
  return {
    body: input.body,
    title: blankToNull(input.title),
    heldOn: input.heldOn,
    place: blankToNull(input.place),
    attendees: (input.attendees ?? []).filter((a) => !seen.has(a.socioId) && seen.add(a.socioId)).map((a) => ({ ...a, name: a.name.trim() })),
    otherAttendees: input.otherAttendees ?? 0,
    agenda: cleanItems(input.agenda),
    agreements: cleanItems(input.agreements),
    visibleToSocios: input.visibleToSocios ?? false,
  };
}

export function buildActaData(input: ActaInput & { createdBy: string; createdAt?: Date }): ActaData {
  const at = input.createdAt ?? new Date();
  return {
    ...buildActaFields(input),
    createdBy: input.createdBy,
    createdAt: at,
    updatedBy: input.createdBy,
    updatedAt: at,
  };
}

/** Newest meeting first; same day, newest written first. */
export function compareActas(a: Pick<ActaData, 'heldOn' | 'createdAt'>, b: Pick<ActaData, 'heldOn' | 'createdAt'>): number {
  return b.heldOn.localeCompare(a.heldOn) || b.createdAt.getTime() - a.createdAt.getTime();
}

// ── Ledger entries ───────────────────────────────────────────────────────────

export const LedgerEntryKindSchema = z.enum(['income', 'expense']);
export type LedgerEntryKind = z.infer<typeof LedgerEntryKindSchema>;

/** A village group's fiestas can cost far more than a cuota; a typo of 100× is still caught. */
export const MAX_LEDGER_CENTS = 100_000_000;

/**
 * One entry at `ledgerEntries/{entryId}`. Never edited or deleted (rules refuse
 * both). A wrong entry is cancelled by a reversal at `rev_<entryId>` that copies
 * its kind, amount, day, concept and category, so it nets out in the same year.
 */
export const LedgerEntryDataSchema = z.object({
  kind: LedgerEntryKindSchema,
  amountCents: z.number().int().min(1).max(MAX_LEDGER_CENTS),
  /** The day the money moved (Madrid), as the treasurer says. */
  on: DayKeySchema,
  concept: z.string().min(1).max(200),
  category: z.string().max(60).nullable(),
  /** Set on a reversal: the entry it cancels. */
  reversesId: z.string().nullable(),
  recordedBy: z.string(),
  recordedAt: z.date(),
});
export type LedgerEntryData = z.infer<typeof LedgerEntryDataSchema>;

export interface LedgerEntryInput {
  kind: LedgerEntryKind;
  amountCents: number;
  on: string;
  concept: string;
  category?: string | null;
  recordedBy: string;
  recordedAt?: Date;
}

export function buildLedgerEntryData(input: LedgerEntryInput): LedgerEntryData {
  return {
    kind: input.kind,
    amountCents: input.amountCents,
    on: input.on,
    concept: input.concept.trim(),
    category: blankToNull(input.category),
    reversesId: null,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt ?? new Date(),
  };
}

export function buildLedgerReversalData(
  entry: LedgerEntryData & { id: string },
  input: { recordedBy: string; recordedAt?: Date },
): LedgerEntryData {
  return {
    kind: entry.kind,
    amountCents: entry.amountCents,
    on: entry.on,
    concept: entry.concept,
    category: entry.category,
    reversesId: entry.id,
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt ?? new Date(),
  };
}

export function ledgerReversalIdFor(entryId: string): string {
  return `rev_${entryId}`;
}
