import { madridDayKey, type FiestaBlock, type FiestaEdition, type WrappedData } from '@cultuvilla/shared/models';
import {
  coveringRange,
  resolveWrappedRequest,
  type WrappedRequest,
  type WrappedRequestProblem,
} from '@cultuvilla/shared/wrapped';
import type { DayRange } from '../date/dayRange';

/** One fiesta block on the create screen: whether it happened this year, and its days. */
export interface WrappedFormBlock {
  blockId: string;
  name: string;
  month: number;
  enabled: boolean;
  range: DayRange | null;
}

export interface WrappedFormState {
  blocks: WrappedFormBlock[];
  /** The range picked by hand. Null while it follows the blocks. */
  customRange: DayRange | null;
}

/**
 * The form an admin starts from.
 *
 * With a Wrapped already built for the year, its own dates — so regenerating
 * begins from what was shared. Otherwise a block dated for the year (its
 * fiesta edition, in `editions`) starts from those days, on once they are
 * over, so the admin confirms rather than picks. Any other block is on unless
 * its month is still ahead (it has not happened yet), and no days are picked:
 * guessing days would put wrong dates on a cover that nobody corrected.
 */
export function initialWrappedForm(
  fiestas: FiestaBlock[],
  today: string,
  existing: Pick<WrappedData, 'blocks' | 'rangeStart' | 'rangeEnd'> | null,
  editions: readonly Pick<FiestaEdition, 'blockId' | 'startDay' | 'endDay'>[] = [],
): WrappedFormState {
  const currentMonth = Number(today.slice(5, 7));
  const sorted = [...fiestas].sort((a, b) => a.month - b.month || a.name.localeCompare(b.name, 'es'));
  if (existing) {
    const built = new Map(existing.blocks.map((b) => [b.blockId, b]));
    const blocks = sorted.map((f) => {
      const b = built.get(f.id);
      return {
        blockId: f.id,
        name: f.name,
        month: f.month,
        enabled: b !== undefined,
        range: b ? { startDay: madridDayKey(b.start), endDay: madridDayKey(b.end) } : null,
      };
    });
    const range = { startDay: madridDayKey(existing.rangeStart), endDay: madridDayKey(existing.rangeEnd) };
    const followed = coveringRange(blocks.flatMap((b) => (b.enabled && b.range ? [b.range] : [])));
    const custom = followed && followed.startDay === range.startDay && followed.endDay === range.endDay ? null : range;
    return { blocks, customRange: custom };
  }
  return {
    blocks: sorted.map((f) => {
      const dated = editions.find((e) => e.blockId === f.id);
      return dated
        ? { blockId: f.id, name: f.name, month: f.month, enabled: dated.endDay <= today, range: { startDay: dated.startDay, endDay: dated.endDay } }
        : { blockId: f.id, name: f.name, month: f.month, enabled: f.month <= currentMonth, range: null };
    }),
    customRange: null,
  };
}

/** The range everything is counted over: the hand-picked one, else the span of the enabled blocks. */
export function effectiveRange(state: WrappedFormState): DayRange | null {
  return state.customRange ?? coveringRange(state.blocks.flatMap((b) => (b.enabled && b.range ? [b.range] : [])));
}

export type WrappedFormProblem = WrappedRequestProblem | 'no-blocks' | 'missing-dates';

/**
 * The request the form describes, or why it cannot be sent yet. Checked with
 * the same `resolveWrappedRequest` the server runs, so the button is never
 * enabled for a request the server will refuse.
 */
export function wrappedFormRequest(
  state: WrappedFormState,
  context: { municipalityId: string; year: number; today: string; fiestas: FiestaBlock[] },
): { ok: true; request: WrappedRequest } | { ok: false; problem: WrappedFormProblem } {
  const enabled = state.blocks.filter((b) => b.enabled);
  if (enabled.length === 0) return { ok: false, problem: 'no-blocks' };
  const range = effectiveRange(state);
  if (!range || enabled.some((b) => b.range === null)) return { ok: false, problem: 'missing-dates' };
  const request: WrappedRequest = {
    municipalityId: context.municipalityId,
    year: context.year,
    blocks: enabled.map((b) => ({ blockId: b.blockId, startDay: b.range?.startDay ?? '', endDay: b.range?.endDay ?? '' })),
    range,
  };
  const resolved = resolveWrappedRequest(request, context.fiestas, context.today);
  return resolved.ok ? { ok: true, request } : { ok: false, problem: resolved.problem };
}
