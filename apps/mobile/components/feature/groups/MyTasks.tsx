import type { ReactNode } from 'react';
import { setGroupTaskDone, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { VStack } from '../../primitives';
import { DetailSectionHeading } from '../DetailSectionHeading';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { useMyOpenTasks } from '../../../lib/orgs/useMyOpenTasks';
import { useOrgMembers } from '../../../lib/orgs/useOrgMembers';
import { ShiftCard, TaskRow } from './TaskRows';

/**
 * The member's side of the group's tasks: what is assigned to them, still
 * open, soonest first (ticked done here), and the upcoming volunteer shifts
 * they can answer. Hidden (or `empty`) while there is neither. `shiftsOnly`
 * leaves out the assigned tasks, for a screen that lists every task anyway.
 */
export function MyTasks({
  orgId,
  uid,
  isAdmin,
  shiftsOnly = false,
  empty,
}: {
  orgId: string;
  uid: string;
  isAdmin: boolean;
  shiftsOnly?: boolean;
  empty?: ReactNode;
}) {
  const { t } = useT();
  const own = useMyOpenTasks(orgId, uid);
  const { shifts, status } = own;
  const mine = shiftsOnly ? [] : own.mine;
  const { nameOf } = useOrgMembers(orgId);

  if (mine.length === 0 && shifts.length === 0) return status === 'ready' && empty ? <>{empty}</> : null;

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
