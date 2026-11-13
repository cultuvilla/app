import type { NewsMention } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';

export interface MentionRun {
  /** The characters of this run, as they appear in the block text. */
  text: string;
  /** Present when this run is a committed mention span. */
  mention?: NewsMention;
}

/**
 * Pure helpers backing the `@`-mention behaviour of a plain-text `TextInput`.
 *
 * A text block stores its prose in `text` and annotates mention ranges in
 * `mentions` (offset/length into `text`, the span covering the mention's display
 * label—the `@` trigger is consumed on insert). RN gives us only a raw string +
 * selection, so these functions keep the `mentions` array consistent as the user
 * edits:
 *
 * - {@link adjustMentions} shifts/drops spans after an arbitrary edit.
 * - {@link activeMentionQuery} detects an in-progress `@query` at the cursor.
 * - {@link insertMention} commits a picked candidate into the text + spans.
 *
 * All are pure and unit-tested (see `__tests__/mentionText.test.ts`).
 */

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a: string, b: string, cap: number): number {
  let i = 0;
  while (i < cap && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

export interface Span {
  offset: number;
  length: number;
}

/**
 * Recompute spans after `oldText` was edited into `newText`. Spans fully
 * before the edited region are kept; spans fully after are shifted by the length
 * delta; spans overlapping the edit are dropped (their text changed, so the
 * annotation is no longer trustworthy).
 */
export function adjustMentions<T extends Span>(
  oldText: string,
  newText: string,
  spans: T[],
): T[] {
  if (oldText === newText) return spans;
  const prefix = commonPrefixLength(oldText, newText);
  const cap = Math.min(oldText.length, newText.length) - prefix;
  const suffix = commonSuffixLength(oldText, newText, Math.max(0, cap));
  const oldChangeEnd = oldText.length - suffix; // exclusive
  const delta = newText.length - oldText.length;

  const result: T[] = [];
  for (const m of spans) {
    const end = m.offset + m.length;
    if (end <= prefix) {
      result.push(m);
    } else if (m.offset >= oldChangeEnd) {
      result.push({ ...m, offset: m.offset + delta });
    }
    // else: overlaps the edited region → drop
  }
  return result;
}

export interface ActiveMentionQuery {
  /** Text typed after the `@`, up to the cursor (may contain spaces). */
  query: string;
  /** Index of the triggering `@` in `text`. */
  startIndex: number;
}

/**
 * If the cursor sits inside an in-progress mention token — an `@` that begins a
 * word (preceded by start-of-text or whitespace) with no newline between it and
 * the cursor, and not inside an already-committed mention — return the query.
 * Otherwise `null`.
 */
export function activeMentionQuery(
  text: string,
  cursor: number,
  mentions: NewsMention[],
): ActiveMentionQuery | null {
  let i = cursor - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '\n') return null; // mentions don't span lines
    if (ch === '@') {
      const before = i === 0 ? '' : (text[i - 1] ?? '');
      if (before !== '' && !/\s/.test(before)) return null; // mid-word @, e.g. an email
      // Don't re-trigger on an already-committed mention span.
      if (mentions.some((m) => m.offset <= i && i < m.offset + m.length)) return null;
      return { query: text.slice(i + 1, cursor), startIndex: i };
    }
    i--;
  }
  return null;
}

/**
 * Split a text block's mention spans at `caret` (for inserting an image
 * mid-paragraph). Spans entirely before the caret stay in `before`; spans
 * entirely after move to `after` with offsets rebased to the split point; a span
 * straddling the caret is dropped.
 */
export function splitMentionsAtCaret<T extends Span>(
  spans: T[],
  caret: number,
): { before: T[]; after: T[] } {
  const before: T[] = [];
  const after: T[] = [];
  for (const m of spans) {
    const end = m.offset + m.length;
    if (end <= caret) before.push(m);
    else if (m.offset >= caret) after.push({ ...m, offset: m.offset - caret });
    // straddles the caret → dropped
  }
  return { before, after };
}

export interface InsertMentionResult {
  text: string;
  mentions: NewsMention[];
  /** Where the caret should land after insertion. */
  cursor: number;
}

/**
 * Replace the active `@query` with the bare label + a trailing space and record
 * the mention span. The span covers the mention's display label (the `@` trigger
 * is consumed on insert). Existing spans after the insertion point are shifted by
 * the length change.
 */
export function insertMention(
  text: string,
  mentions: NewsMention[],
  active: ActiveMentionQuery,
  candidate: MentionCandidate,
): InsertMentionResult {
  const labelText = candidate.label; // no leading '@': the picked reference reads as its bare name
  const before = text.slice(0, active.startIndex);
  const after = text.slice(active.startIndex + 1 + active.query.length);
  const newText = `${before}${labelText} ${after}`;

  const consumedLen = 1 + active.query.length; // '@' + query, still consumed from the input
  const insertedLen = labelText.length + 1; // label + trailing space
  const shift = insertedLen - consumedLen;
  const afterPoint = active.startIndex + consumedLen;

  const shifted = mentions.map((m) =>
    m.offset >= afterPoint ? { ...m, offset: m.offset + shift } : m,
  );
  const newMention: NewsMention = {
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    label: candidate.label,
    offset: active.startIndex,
    length: labelText.length,
  };

  return {
    text: newText,
    mentions: [...shifted, newMention].sort((a, b) => a.offset - b.offset),
    cursor: active.startIndex + labelText.length + 1,
  };
}

/**
 * Split `text` into ordered runs of plain prose and mention spans. Spans that
 * are out of range, non-positive length, or overlap an earlier span are skipped
 * (their characters fall back to plain prose) so a malformed block still renders.
 */
export function mentionRuns(text: string, mentions: NewsMention[]): MentionRun[] {
  const sorted = [...mentions].sort((a, b) => a.offset - b.offset);
  const runs: MentionRun[] = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.offset < cursor || m.offset + m.length > text.length || m.length <= 0) continue;
    if (m.offset > cursor) runs.push({ text: text.slice(cursor, m.offset) });
    runs.push({ text: text.slice(m.offset, m.offset + m.length), mention: m });
    cursor = m.offset + m.length;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs;
}

export type MentionDeleteDirection = 'backward' | 'forward';

export interface DeleteMentionResult {
  text: string;
  mentions: NewsMention[];
  /** Where the caret should land after the whole span is removed. */
  cursor: number;
}

/**
 * If a collapsed caret sits at the trailing edge of a mention (Backspace /
 * `backward`) or its leading edge (Delete / `forward`), remove the entire span's
 * characters and drop its annotation in one edit. Returns `null` when the caret
 * is not at a mention edge, so the caller lets the native keystroke fall through.
 */
export function deleteMentionAt(
  text: string,
  mentions: NewsMention[],
  caret: number,
  direction: MentionDeleteDirection,
): DeleteMentionResult | null {
  const target = mentions.find((m) =>
    direction === 'backward' ? caret === m.offset + m.length : caret === m.offset,
  );
  if (!target) return null;

  const start = target.offset;
  const end = target.offset + target.length;
  const newText = text.slice(0, start) + text.slice(end);
  const remaining = mentions
    .filter((m) => m !== target)
    .map((m) => (m.offset >= end ? { ...m, offset: m.offset - target.length } : m));

  return { text: newText, mentions: remaining, cursor: start };
}
