import {
  daysUntilFiestaEdition,
  editionBlock,
  fiestaEditionPhase,
  type DayKey,
  type FiestaBlock,
  type FiestaEdition,
  type FiestaEditionPhase,
} from '@cultuvilla/shared/models';

/** An edition with the block it dates, as the profile names it today. */
export interface NamedEdition extends FiestaEdition {
  block: FiestaBlock;
}

/**
 * The editions whose block still exists, named after it, oldest first. One
 * whose block was removed from the profile has nothing to call it, so it is
 * dropped rather than shown nameless.
 */
export function namedEditions(editions: readonly FiestaEdition[], fiestas: readonly FiestaBlock[]): NamedEdition[] {
  return editions
    .flatMap((e) => {
      const block = editionBlock(e, fiestas);
      return block ? [{ ...e, block }] : [];
    })
    .sort((a, b) => a.startDay.localeCompare(b.startDay));
}

/** How long before an edition starts the village home starts announcing it. */
export const PROGRAMME_LEAD_DAYS = 45;

export type FiestasHomeCard =
  | { kind: 'programme'; edition: NamedEdition; phase: Exclude<FiestaEditionPhase, 'over'>; daysToGo: number }
  | { kind: 'propose'; block: FiestaBlock; year: number };

/**
 * What the village home says about the fiestas today, if anything.
 *
 * - An edition on now, or starting within `PROGRAMME_LEAD_DAYS`: its programme
 *   (the running one first, then the soonest).
 * - Otherwise, for a member, a block whose month is this one or the next and
 *   that has no edition for that year yet: an invitation to add its days.
 *   That is when the programme exists on paper, and the earliest anyone would
 *   look for it.
 */
export function fiestasHomeCard(
  fiestas: readonly FiestaBlock[],
  editions: readonly NamedEdition[],
  today: DayKey,
  isMember: boolean,
): FiestasHomeCard | null {
  const live = editions
    .map((edition) => ({ edition, phase: fiestaEditionPhase(edition, today), daysToGo: daysUntilFiestaEdition(edition, today) }))
    .filter((e) => e.phase === 'running' || (e.phase === 'upcoming' && e.daysToGo <= PROGRAMME_LEAD_DAYS));
  const running = live.find((e) => e.phase === 'running');
  const next = running ?? live.sort((a, b) => a.daysToGo - b.daysToGo)[0];
  if (next) return { kind: 'programme', edition: next.edition, phase: next.phase === 'running' ? 'running' : 'upcoming', daysToGo: next.daysToGo };

  if (!isMember) return null;
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const soon = [
    { month, year },
    month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year },
  ];
  for (const when of soon) {
    const block = [...fiestas]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .find((f) => f.month === when.month && !editions.some((e) => e.blockId === f.id && e.year === when.year));
    if (block) return { kind: 'propose', block, year: when.year };
  }
  return null;
}

/** The editions of one year, for its programme page. */
export function editionsOfYear(editions: readonly NamedEdition[], year: number): NamedEdition[] {
  return editions.filter((e) => e.year === year);
}

/**
 * The year's blocks with no edition yet — what a member is offered to date on
 * the programme page — in month order.
 */
export function undatedBlocks(fiestas: readonly FiestaBlock[], editions: readonly NamedEdition[], year: number): FiestaBlock[] {
  return [...fiestas]
    .filter((f) => !editions.some((e) => e.blockId === f.id && e.year === year))
    .sort((a, b) => a.month - b.month || a.name.localeCompare(b.name, 'es'));
}
