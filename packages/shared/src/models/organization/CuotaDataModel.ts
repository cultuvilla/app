import { z } from 'zod';
import { DayKeySchema } from '../municipality/FiestaBlockModel';

/**
 * The cuota de socios of a group (peña, asociación, otros). Cultuvilla holds
 * no money: payments happen off-app (cash, Bizum, transfer, direct debit) and
 * the treasurer records them here. Amounts are integer euro cents.
 *
 * - `cuotaSettings/current` — what the cuota is and how to pay it (admins write,
 *   members read).
 * - `cuotaAssignments/{socioId}` — a socio's tier, exemption or custom amount.
 * - `cuotaPayments/{paymentId}` — append-only ledger; a mistake is a reversal.
 * - `cuotaReminders/{id}` — what the reminder job sent, per socio per period.
 *
 * Status (al día / pendiente / vencida) is never stored: it is computed on read
 * by `computeCuotaStatuses` from these docs and the day it is asked.
 */

export const CUOTA_SETTINGS_DOC_ID = 'current';

/** `YYYY` for a yearly cuota, `YYYY-MM` for a monthly one. */
export const PeriodKeySchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'not a period key');
export type PeriodKey = z.infer<typeof PeriodKeySchema>;

export const CuotaPeriodicitySchema = z.enum(['yearly', 'monthly']);
export type CuotaPeriodicity = z.infer<typeof CuotaPeriodicitySchema>;

/** Generous ceiling: no village cuota is near it, a typo of 100× is. */
export const MAX_CUOTA_CENTS = 1_000_000;
const CentsSchema = z.number().int().min(0).max(MAX_CUOTA_CENTS);

/**
 * The price of one calendar year, when it is not the usual one. A year missing
 * from the list pays the usual price; a monthly cuota applies it to each month.
 */
export const CuotaYearAmountSchema = z.object({
  year: z.string().regex(/^\d{4}$/, 'not a year'),
  amountCents: CentsSchema,
});
export type CuotaYearAmount = z.infer<typeof CuotaYearAmountSchema>;
export const MAX_CUOTA_YEAR_AMOUNTS = 30;

// `.default([])`: beta binaries save the settings without it.
const YearAmountsSchema = z.array(CuotaYearAmountSchema).max(MAX_CUOTA_YEAR_AMOUNTS).default([]);

/**
 * An optional price other than the base one — reducida jubilados, familiar.
 * `coversPersonas`: a member on this tier pays once for themself and every
 * persona a cargo they answer for (a household payment).
 */
export const CuotaTierSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  amountCents: CentsSchema,
  yearAmounts: YearAmountsSchema,
  coversPersonas: z.boolean(),
});
export type CuotaTier = z.infer<typeof CuotaTierSchema>;
export const MAX_CUOTA_TIERS = 10;

export const CuotaSettingsDataSchema = z.object({
  amountCents: CentsSchema,
  yearAmounts: YearAmountsSchema,
  periodicity: CuotaPeriodicitySchema,
  /** Month the yearly cuota falls due (1–12); unused by a monthly one. */
  dueMonth: z.number().int().min(1).max(12),
  /** Day of the month it falls due; clamped to the month's last day. */
  dueDay: z.number().int().min(1).max(31),
  /** Unused since an unpaid cuota is vencida right after its due day. Installed binaries still require it, and new saves write 0. */
  graceDays: z.number().int().min(0).max(365),
  /** The first period the group tracks: earlier ones are never owed. */
  startPeriod: PeriodKeySchema,
  tiers: z.array(CuotaTierSchema).max(MAX_CUOTA_TIERS),
  /** How to pay — shown to socios and in reminders. */
  bizum: z.string().max(40).nullable(),
  iban: z.string().max(40).nullable(),
  payInstructions: z.string().max(500).nullable(),
  /** The scheduled reminders, in the treasurer's name. Off until an admin turns them on. */
  remindersEnabled: z.boolean(),
  /** The admin who last saved the settings — the reminders' signer when no admin is the tesorero. */
  configuredBy: z.string(),
  updatedAt: z.date(),
});
export type CuotaSettingsData = z.infer<typeof CuotaSettingsDataSchema>;

export type CuotaTierInput = Omit<CuotaTier, 'yearAmounts'> & { yearAmounts?: CuotaYearAmount[] };

function sortedByYear(amounts: CuotaYearAmount[] | undefined): CuotaYearAmount[] {
  return [...(amounts ?? [])].sort((a, b) => a.year.localeCompare(b.year));
}

export interface CuotaSettingsInput {
  amountCents: number;
  yearAmounts?: CuotaYearAmount[];
  periodicity: CuotaPeriodicity;
  dueMonth: number;
  dueDay: number;
  graceDays: number;
  startPeriod: PeriodKey;
  tiers?: CuotaTierInput[];
  bizum?: string | null;
  iban?: string | null;
  payInstructions?: string | null;
  remindersEnabled?: boolean;
  configuredBy: string;
  updatedAt?: Date;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function buildCuotaSettingsData(input: CuotaSettingsInput): CuotaSettingsData {
  return {
    amountCents: input.amountCents,
    yearAmounts: sortedByYear(input.yearAmounts),
    periodicity: input.periodicity,
    dueMonth: input.dueMonth,
    dueDay: input.dueDay,
    graceDays: input.graceDays,
    startPeriod: input.startPeriod,
    tiers: (input.tiers ?? []).map((t) => ({ ...t, name: t.name.trim(), yearAmounts: sortedByYear(t.yearAmounts) })),
    bizum: blankToNull(input.bizum),
    iban: blankToNull(input.iban)?.replace(/\s+/g, ' ').toUpperCase() ?? null,
    payInstructions: blankToNull(input.payInstructions),
    remindersEnabled: input.remindersEnabled ?? false,
    configuredBy: input.configuredBy,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

/**
 * What one socio pays, at `cuotaAssignments/{socioId}`: a tier, an exemption,
 * or a custom amount (which wins over the tier). No doc = the base cuota.
 */
export const CuotaAssignmentDataSchema = z.object({
  tierId: z.string().nullable(),
  exempt: z.boolean(),
  customAmountCents: CentsSchema.nullable(),
  updatedBy: z.string(),
  updatedAt: z.date(),
});
export type CuotaAssignmentData = z.infer<typeof CuotaAssignmentDataSchema>;

export interface CuotaAssignmentInput {
  tierId?: string | null;
  exempt?: boolean;
  customAmountCents?: number | null;
  updatedBy: string;
  updatedAt?: Date;
}

export function buildCuotaAssignmentData(input: CuotaAssignmentInput): CuotaAssignmentData {
  return {
    tierId: input.tierId ?? null,
    exempt: input.exempt ?? false,
    customAmountCents: input.customAmountCents ?? null,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt ?? new Date(),
  };
}

export const CuotaPaymentMethodSchema = z.enum(['efectivo', 'bizum', 'transferencia', 'domiciliacion']);
export type CuotaPaymentMethod = z.infer<typeof CuotaPaymentMethodSchema>;
export const CUOTA_PAYMENT_METHODS: readonly CuotaPaymentMethod[] = CuotaPaymentMethodSchema.options;

/**
 * One ledger entry at `cuotaPayments/{paymentId}`. Never edited or deleted
 * (rules refuse both): a wrong entry is cancelled by a `reversal` whose id is
 * `rev_<paymentId>`, so a payment can be reversed once. A reversal copies the
 * payment's socio, period, amount and method; its `paidOn` is the day it was
 * recorded.
 */
export const CuotaPaymentKindSchema = z.enum(['payment', 'reversal']);
export type CuotaPaymentKind = z.infer<typeof CuotaPaymentKindSchema>;

export const CuotaPaymentDataSchema = z.object({
  socioId: z.string(),
  periodKey: PeriodKeySchema,
  kind: CuotaPaymentKindSchema,
  reversesId: z.string().nullable(),
  amountCents: CentsSchema.min(1),
  method: CuotaPaymentMethodSchema,
  /** The calendar day the money changed hands (Madrid), as the treasurer says. */
  paidOn: DayKeySchema,
  note: z.string().max(500).nullable(),
  recordedBy: z.string(),
  recordedAt: z.date(),
});
export type CuotaPaymentData = z.infer<typeof CuotaPaymentDataSchema>;

export function reversalIdFor(paymentId: string): string {
  return `rev_${paymentId}`;
}

export interface CuotaPaymentInput {
  socioId: string;
  periodKey: PeriodKey;
  amountCents: number;
  method: CuotaPaymentMethod;
  paidOn: string;
  note?: string | null;
  recordedBy: string;
  recordedAt?: Date;
}

export function buildCuotaPaymentData(input: CuotaPaymentInput): CuotaPaymentData {
  return {
    socioId: input.socioId,
    periodKey: input.periodKey,
    kind: 'payment',
    reversesId: null,
    amountCents: input.amountCents,
    method: input.method,
    paidOn: input.paidOn,
    note: blankToNull(input.note),
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt ?? new Date(),
  };
}

export function buildCuotaReversalData(
  payment: CuotaPaymentData & { id: string },
  input: { paidOn: string; note?: string | null; recordedBy: string; recordedAt?: Date },
): CuotaPaymentData {
  return {
    socioId: payment.socioId,
    periodKey: payment.periodKey,
    kind: 'reversal',
    reversesId: payment.id,
    amountCents: payment.amountCents,
    method: payment.method,
    paidOn: input.paidOn,
    note: blankToNull(input.note),
    recordedBy: input.recordedBy,
    recordedAt: input.recordedAt ?? new Date(),
  };
}

/** `before` the due date, or once `after` it, when the cuota is vencida. */
export const CuotaReminderStageSchema = z.enum(['before', 'after']);
export type CuotaReminderStage = z.infer<typeof CuotaReminderStageSchema>;

/**
 * One reminder the scheduled job sent, at
 * `cuotaReminders/{periodKey}_{stage}_{socioId}`. Created before sending, so a
 * retried run finds it and sends nothing twice. Function-owned; admins read it.
 */
export const CuotaReminderDataSchema = z.object({
  socioId: z.string(),
  periodKey: PeriodKeySchema,
  stage: CuotaReminderStageSchema,
  /** The account reminded: the member, or a persona's responsible member. Null for a typed socio. */
  recipientUid: z.string().nullable(),
  push: z.boolean(),
  email: z.boolean(),
  signerName: z.string(),
  sentAt: z.date(),
});
export type CuotaReminderData = z.infer<typeof CuotaReminderDataSchema>;

export function cuotaReminderId(periodKey: string, stage: CuotaReminderStage, socioId: string): string {
  return `${periodKey}_${stage}_${socioId}`;
}
