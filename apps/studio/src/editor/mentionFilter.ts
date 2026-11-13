import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';

const MAX_SUGGESTIONS = 8;

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Candidates for an `@query`, accent- and case-blind: names that start with
 * the query first, then names with a word that does.
 */
export function filterMentionCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const q = fold(query.trim());
  if (!q) return candidates.slice(0, MAX_SUGGESTIONS);
  const starts: MentionCandidate[] = [];
  const words: MentionCandidate[] = [];
  for (const c of candidates) {
    const label = fold(c.label);
    if (label.startsWith(q)) starts.push(c);
    else if (label.split(/[\s\-–—'’.,]+/).some((w) => w.startsWith(q))) words.push(c);
  }
  return [...starts, ...words].slice(0, MAX_SUGGESTIONS);
}
