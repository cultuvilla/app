import { z } from 'zod';
import { DayKeySchema, madridDayRange, type DayKey, type FiestaBlock } from '../municipality/FiestaBlockModel';
import { madridDayKey } from '../event/EventDataModel';

/**
 * One year of one fiesta block: the days Santiago runs in 2026. Stored at
 * `fiestaEditions/{municipalityId}_{blockId}_{year}` (top-level).
 *
 * The block (`community.fiestas`) is a name and a month because its days move
 * every year; the edition is where one year's days live, entered before the
 * fiestas by whoever has the programme in hand. Any village member proposes
 * it, and the proposer or a village admin corrects it — the id is
 * deterministic, so there is only ever one per block per year and a second
 * proposal is a correction, which firestore.rules keeps to those two.
 *
 * Days, not instants, cross the wire (`DayKey`, a Madrid calendar day), for
 * the same reason as the Wrapped: a phone in another time zone must never move
 * a fiesta by a day. `madridDayRange` resolves them when an instant is needed.
 * The block's display name is not copied here: a rename on the profile shows
 * everywhere at once.
 */
export const FiestaEditionDataSchema = z.object({
  municipalityId: z.string(),
  /** The village's permanent URL slug, denormalized so a card can link without a read. */
  villageSlug: z.string(),
  /** `FiestaBlock.id` on the village's `community.fiestas`. */
  blockId: z.string().min(1),
  year: z.number().int(),
  startDay: DayKeySchema,
  endDay: DayKeySchema,
  proposedBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type FiestaEditionData = z.infer<typeof FiestaEditionDataSchema>;
export type FiestaEdition = FiestaEditionData & { id: string };

/** A fiesta longer than a month is a typo. Checked by the form, not the rules. */
export const MAX_FIESTA_EDITION_DAYS = 31;

/** The one id a block's edition for a year can have. */
export function fiestaEditionId(municipalityId: string, blockId: string, year: number): string {
  return `${municipalityId}_${blockId}_${String(year)}`;
}

export interface FiestaEditionDataInput {
  municipalityId: string;
  villageSlug: string;
  blockId: string;
  year: number;
  startDay: DayKey;
  endDay: DayKey;
  proposedBy: string;
  createdAt?: Date;
}

export function buildFiestaEditionData(input: FiestaEditionDataInput): FiestaEditionData {
  const now = input.createdAt ?? new Date();
  return {
    municipalityId: input.municipalityId,
    villageSlug: input.villageSlug,
    blockId: input.blockId,
    year: input.year,
    startDay: input.startDay,
    endDay: input.endDay,
    proposedBy: input.proposedBy,
    createdAt: now,
    updatedAt: now,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from `a` to `b`, both `YYYY-MM-DD`; DST-proof because it never leaves UTC. */
function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export type FiestaEditionProblem = 'order' | 'year' | 'too-long';

/**
 * Why a picked range cannot be an edition of `year`, or null. It starts in its
 * year (a Nochevieja that runs into January still belongs to the year it
 * started), ends on or after it starts, and lasts at most a month.
 */
export function fiestaEditionProblem(year: number, startDay: DayKey, endDay: DayKey): FiestaEditionProblem | null {
  if (endDay < startDay) return 'order';
  if (Number(startDay.slice(0, 4)) !== year || Number(endDay.slice(0, 4)) > year + 1) return 'year';
  if (daysBetween(startDay, endDay) + 1 > MAX_FIESTA_EDITION_DAYS) return 'too-long';
  return null;
}

export type FiestaEditionPhase = 'upcoming' | 'running' | 'over';

/** Where an edition stands on a Madrid calendar day. */
export function fiestaEditionPhase(edition: Pick<FiestaEditionData, 'startDay' | 'endDay'>, today: DayKey): FiestaEditionPhase {
  if (today < edition.startDay) return 'upcoming';
  if (today > edition.endDay) return 'over';
  return 'running';
}

/** Days until an upcoming edition starts (0 once it is running or over). */
export function daysUntilFiestaEdition(edition: Pick<FiestaEditionData, 'startDay'>, today: DayKey): number {
  return Math.max(0, daysBetween(today, edition.startDay));
}

/** The instants an edition spans, first to last, in Madrid. */
export function fiestaEditionRange(edition: Pick<FiestaEditionData, 'startDay' | 'endDay'>): { start: Date; end: Date } {
  return madridDayRange(edition.startDay, edition.endDay);
}

/**
 * The edition whose days contain `at`'s Madrid day, or null — what the event
 * form offers to tag an event with. When two overlap (they should not), the
 * one that started last wins: it is the more specific.
 */
export function editionContaining<E extends Pick<FiestaEditionData, 'startDay' | 'endDay'>>(
  editions: readonly E[],
  at: Date,
): E | null {
  const day = madridDayKey(at);
  const hits = editions.filter((e) => e.startDay <= day && day <= e.endDay);
  hits.sort((a, b) => b.startDay.localeCompare(a.startDay));
  return hits[0] ?? null;
}

/**
 * The block an edition belongs to, from the village's current profile. Null
 * when the block was removed since: its edition then has no name to show and
 * is left out rather than shown nameless.
 */
export function editionBlock(edition: Pick<FiestaEditionData, 'blockId'>, fiestas: readonly FiestaBlock[]): FiestaBlock | null {
  return fiestas.find((f) => f.id === edition.blockId) ?? null;
}
