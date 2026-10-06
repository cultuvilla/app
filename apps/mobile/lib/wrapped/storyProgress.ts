/**
 * The Wrapped viewer's clock, kept pure so it can be tested without timers.
 *
 * `index` runs from 0 to `count` inclusive: `count` is the closing screen after
 * the last card, which never advances on its own — it holds the share and
 * village actions and must wait for the reader.
 */

/** How long a card stays up before the next one: long enough to read the stats card. */
export const STORY_CARD_MS = 6000;

export interface StoryState {
  index: number;
  /** Milliseconds the current card has been showing. */
  elapsed: number;
}

export function startAt(index: number, count: number): StoryState {
  return { index: Math.min(Math.max(index, 0), Math.max(count - 1, 0)), elapsed: 0 };
}

export function tick(state: StoryState, ms: number, count: number): StoryState {
  if (state.index >= count) return state;
  const elapsed = state.elapsed + ms;
  return elapsed >= STORY_CARD_MS ? { index: state.index + 1, elapsed: 0 } : { index: state.index, elapsed };
}

export function step(state: StoryState, direction: 1 | -1, count: number): StoryState {
  return { index: Math.min(Math.max(state.index + direction, 0), count), elapsed: 0 };
}

/** How full card `i`'s progress bar is, from 0 to 1. */
export function barFill(state: StoryState, i: number): number {
  if (i < state.index) return 1;
  if (i > state.index) return 0;
  return Math.min(state.elapsed / STORY_CARD_MS, 1);
}

/** The story convention: the left third goes back, the rest goes forward. */
export function tapDirection(x: number, width: number): 1 | -1 {
  return x < width / 3 ? -1 : 1;
}
