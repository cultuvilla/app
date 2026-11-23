import { describe, expect, it } from 'vitest';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';
import { filterMentionCandidates } from './mentionFilter';

const c = (label: string): MentionCandidate => ({ entityType: 'organization', entityId: label, label });

describe('filterMentionCandidates', () => {
  const all = [c('Peña El Pilón'), c('Ermita de San Roque'), c('Pilonas'), c('Asociación Cultural')];

  it('ignores accents and case', () => {
    expect(filterMentionCandidates(all, 'pena').map((x) => x.label)).toEqual(['Peña El Pilón']);
    expect(filterMentionCandidates(all, 'ASOCIACION').map((x) => x.label)).toEqual(['Asociación Cultural']);
  });

  it('ranks names that start with the query above names with a word that does', () => {
    expect(filterMentionCandidates(all, 'pil').map((x) => x.label)).toEqual(['Pilonas', 'Peña El Pilón']);
  });

  it('offers the first few when nothing is typed yet', () => {
    expect(filterMentionCandidates(all, '')).toHaveLength(4);
  });
});
