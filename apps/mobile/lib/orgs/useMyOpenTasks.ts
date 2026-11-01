import { useMemo } from 'react';
import { compareTasksByDue } from '@cultuvilla/shared/models/organization';
import { watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { useWatch, type WatchStatus } from '../hooks/useWatch';

export interface MyOpenTasks {
  /** Open tasks assigned to the user, soonest first. */
  mine: GroupTask[];
  status: WatchStatus;
}

/** The member's open tasks — the Tareas button's badge. */
export function useMyOpenTasks(orgId: string, uid: string): MyOpenTasks {
  const open = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', orgId, (next, error) => watchOpenGroupTasks(orgId, next, error));
  const mine = useMemo(
    () => [...(open.data ?? [])].sort(compareTasksByDue).filter((task) => task.slots === null && task.assigneeUids.includes(uid)),
    [open.data, uid],
  );
  return { mine, status: open.status };
}
