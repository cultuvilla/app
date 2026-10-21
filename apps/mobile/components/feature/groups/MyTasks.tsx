import { useMemo } from 'react';
import { compareTasksByDue } from '@cultuvilla/shared/models/organization';
import { setGroupTaskDone, watchOpenGroupTasks, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { todayKey } from '../../../lib/orgs/cuota';
import { useOrgMembers } from '../../../lib/orgs/useOrgMembers';
import { ShiftCard, TaskRow } from './TaskRows';

/**
 * The member's side of the group's tasks: what is assigned to them, still
 * open, soonest first (ticked done here), and the upcoming volunteer shifts
 * they can answer. Hidden while there is neither.
 */
export function MyTasks({ orgId, uid, isAdmin }: { orgId: string; uid: string; isAdmin: boolean }) {
  const { t } = useT();
  const open = useWatch<GroupTask[]>('groups:watchOpenGroupTasks', orgId, (next, error) => watchOpenGroupTasks(orgId, next, error));
  const { nameOf } = useOrgMembers(orgId);
  const today = todayKey();

  const { mine, shifts } = useMemo(() => {
    const rows = [...(open.data ?? [])].sort(compareTasksByDue);
    return {
      mine: rows.filter((task) => task.slots === null && task.assigneeUids.includes(uid)),
      shifts: rows.filter((task) => task.slots !== null && task.dueOn !== null && task.dueOn >= today),
    };
  }, [open.data, uid, today]);

  if (mine.length === 0 && shifts.length === 0) return null;

  const tick = (task: GroupTask, done: boolean) => {
    setGroupTaskDone(orgId, task.id, done, uid).catch(() => showAlert(t('groups.tasks.error')));
  };

  return (
    <VStack gap={2} testID="my-tasks">
      {mine.length > 0 ? (
        <>
          <DetailSectionHeading>{t('groups.tasks.myTitle')}</DetailSectionHeading>
          {mine.map((task) => (
            <TaskRow key={task.id} task={task} canTick onTick={(done) => tick(task, done)} nameOf={nameOf} />
          ))}
        </>
      ) : null}
      {shifts.length > 0 ? (
        <>
          <DetailSectionHeading>{t('groups.tasks.shiftsTitle')}</DetailSectionHeading>
          {shifts.map((task) => (
            <ShiftCard key={task.id} task={task} orgId={orgId} uid={uid} nameOf={nameOf} showNames={isAdmin} />
          ))}
        </>
      ) : null}
    </VStack>
  );
}
