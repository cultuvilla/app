import { useCallback, useMemo } from 'react';
import { eventTaskProgress } from '@cultuvilla/shared/models/organization';
import { watchGroupTasksOfEvents, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { useWatch } from '../hooks/useWatch';
import { useT } from '../i18n';
import type { ProgressBadge } from '../../components/feature/VillageSections';

/** Firestore's cap on an `in` filter. The lists show soonest first, so what falls off is the far end. */
const MAX_EVENTS = 30;

/** Each event's tasks done of its total, for its card; an event with no tasks has no badge. */
export function useEventTaskBadges(orgId: string, eventIds: string[]): (eventId: string) => ProgressBadge | undefined {
  const { t } = useT();
  const ids = useMemo(() => eventIds.slice(0, MAX_EVENTS), [eventIds]);
  const tasks = useWatch<GroupTask[]>(
    'groups:watchGroupTasksOfEvents',
    ids.length > 0 ? `${orgId}|${ids.join(',')}` : null,
    ids.length > 0 ? (next, error) => watchGroupTasksOfEvents(orgId, ids, next, error) : null,
  );
  const progress = useMemo(() => eventTaskProgress(tasks.data ?? []), [tasks.data]);
  return useCallback(
    (eventId) => {
      const entry = progress.get(eventId);
      if (!entry) return undefined;
      return {
        text: `${String(entry.done)}/${String(entry.total)}`,
        spoken: t('groups.tasks.checklists.progress', { done: entry.done, total: entry.total }),
      };
    },
    [progress, t],
  );
}
