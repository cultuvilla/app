import { useMemo } from 'react';
import { compareTasksByDue } from '@cultuvilla/shared/models/organization';
import { watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { useWatch, type WatchStatus } from '../hooks/useWatch';
import { todayKey } from './cuota';

export interface MyOpenTasks {
  /** Open tasks assigned to the user, soonest first. */
  mine: GroupTask[];
  /** Upcoming volunteer shifts anyone may answer. */
  shifts: GroupTask[];
  status: WatchStatus;
}

/** The member's open tasks and the group's upcoming shifts — the tasks screen and the home's summary. */
export function useMyOpenTasks(orgId: string, uid: string): MyOpenTasks {
  const open = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', orgId, (next, error) => watchOpenGroupTasks(orgId, next, error));
  const today = todayKey();
  const { mine, shifts } = useMemo(() => {
    const rows = [...(open.data ?? [])].sort(compareTasksByDue);
    return {
      mine: rows.filter((task) => task.slots === null && task.assigneeUids.includes(uid)),
      shifts: rows.filter((task) => task.slots !== null && task.dueOn !== null && task.dueOn >= today),
    };
  }, [open.data, uid, today]);
  return { mine, shifts, status: open.status };
}
