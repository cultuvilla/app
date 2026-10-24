import { useEffect, useState } from 'react';
import {
  getMentionCandidates,
  type MentionCandidate,
} from '@cultuvilla/shared/services/mentionCandidateService';

/**
 * Load every entity a news `@`-mention can point at in this pueblo (see
 * `getMentionCandidates`). Loaded once per municipality.
 *
 * `excludeNewsId` drops the article being edited from the news candidates so a
 * post can't `@`-mention itself.
 */
export function useMentionSources(
  municipalityId: string | null,
  excludeNewsId?: string,
): {
  candidates: MentionCandidate[];
  loading: boolean;
} {
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!municipalityId) {
      setCandidates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getMentionCandidates(municipalityId, excludeNewsId).then((loaded) => {
      if (cancelled) return;
      setCandidates(loaded);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [municipalityId, excludeNewsId]);

  return { candidates, loading };
}
