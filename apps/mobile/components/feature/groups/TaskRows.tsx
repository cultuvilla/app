import { useState } from 'react';
import { freeSlots, isTaskOverdue, shiftStateOf, type ShiftAnswer } from '@cultuvilla/shared/models/organization';
import { respondToTaskShift, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { formatDate } from '@cultuvilla/shared/utils';
import { Button, Card, Checkbox, HStack, Pressable, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { recurrenceLabel, taskWhenLabel } from '../../../lib/orgs/tasks';
import { todayKey } from '../../../lib/orgs/cuota';

/**
 * One task as a row: a done tick (when the viewer may tick it), the title,
 * when it is due, who it is for and how it repeats. Tapping the text opens it
 * for editing when `onEdit` is given (admins).
 */
export function TaskRow({
  task,
  canTick,
  onTick,
  onEdit,
  nameOf,
}: {
  task: GroupTask;
  canTick: boolean;
  onTick: (done: boolean) => void;
  onEdit?: () => void;
  nameOf: (uid: string) => string;
}) {
  const { t } = useT();
  const overdue = isTaskOverdue(task, todayKey());
  const done = task.doneAt !== null;
  const who =
    task.slots !== null
      ? t('groups.tasks.shift.slots', { claimed: task.claimedUids.length, slots: task.slots })
      : task.assigneeUids.length > 0
        ? t('groups.tasks.assignedTo', { names: task.assigneeUids.map(nameOf).join(', ') })
        : t('groups.tasks.unassigned');
  const lines = [
    done && task.doneAt
      ? t('groups.tasks.doneBy', { name: task.doneBy ? nameOf(task.doneBy) : '—', date: formatDate(task.doneAt, 'short') })
      : taskWhenLabel(t, task),
    who,
    task.recurrence ? recurrenceLabel(t, task.recurrence) : null,
  ].filter(Boolean);

  const body = (
    <VStack gap={0} className="flex-1">
      <Text className={done ? 'line-through' : 'font-bold'} tone={done ? 'muted' : 'primary'}>
        {task.title}
      </Text>
      <Text variant="bodySm" tone={overdue ? 'danger' : 'muted'}>
        {overdue ? `${t('groups.tasks.overdue')} · ${lines.join(' · ')}` : lines.join(' · ')}
      </Text>
      {task.notes ? (
        <Text variant="bodySm" tone="muted" numberOfLines={2}>
          {task.notes}
        </Text>
      ) : null}
    </VStack>
  );

  return (
    <HStack gap={3} align="center" className="py-1" testID={`task-row-${task.id}`}>
      {canTick ? (
        <Checkbox value={done} onValueChange={onTick} testID={`task-tick-${task.id}`} />
      ) : null}
      {onEdit ? (
        <Pressable className="flex-1" accessibilityRole="button" onPress={onEdit} testID={`task-edit-${task.id}`}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </HStack>
  );
}

/**
 * A volunteer shift as a card: when, how many slots are taken, the member's
 * own answer and the buttons to change it. The answer goes through the
 * `respondToTaskShift` callable, which holds the cap.
 */
export function ShiftCard({
  task,
  orgId,
  uid,
  nameOf,
  showNames,
}: {
  task: GroupTask;
  orgId: string;
  uid: string;
  nameOf: (uid: string) => string;
  /** Who is in and who waits — shown to admins. */
  showNames: boolean;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState<ShiftAnswer | null>(null);
  const state = shiftStateOf(task, uid);
  const full = freeSlots(task) === 0;

  const answer = (a: ShiftAnswer) => {
    setBusy(a);
    respondToTaskShift(orgId, task.id, a)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setBusy(null));
  };

  const stateLine =
    state === 'claimed'
      ? t('groups.tasks.shift.state.claimed')
      : state === 'waitlisted'
        ? t('groups.tasks.shift.state.waitlisted', { position: task.waitlistUids.indexOf(uid) + 1 })
        : state === 'declined'
          ? t('groups.tasks.shift.state.declined')
          : null;

  return (
    <Card testID={`shift-${task.id}`}>
      <VStack gap={2}>
        <HStack gap={2} align="center" justify="between">
          <Text className="font-bold flex-1">{task.title}</Text>
          <Text variant="bodySm" tone={full ? 'muted' : 'success'} className="font-bold">
            {full ? t('groups.tasks.shift.full') : t('groups.tasks.shift.slots', { claimed: task.claimedUids.length, slots: task.slots ?? 0 })}
          </Text>
        </HStack>
        <Text variant="bodySm" tone="muted">
          {taskWhenLabel(t, task)}
        </Text>
        {task.notes ? <Text variant="bodySm">{task.notes}</Text> : null}
        {showNames ? (
          <Text variant="bodySm" tone="muted" testID={`shift-names-${task.id}`}>
            {[
              task.claimedUids.length > 0
                ? t('groups.tasks.shift.volunteers', { names: task.claimedUids.map(nameOf).join(', ') })
                : t('groups.tasks.shift.noVolunteers'),
              task.waitlistUids.length > 0 ? t('groups.tasks.shift.waiting', { names: task.waitlistUids.map(nameOf).join(', ') }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
        {stateLine ? (
          <Text variant="bodySm" className="font-bold" testID={`shift-state-${task.id}`}>
            {stateLine}
          </Text>
        ) : null}
        <HStack gap={2}>
          {state === 'none' || state === 'declined' ? (
            <Button size="md" onPress={() => answer('claim')} loading={busy === 'claim'} testID={`shift-claim-${task.id}`}>
              {full ? t('groups.tasks.shift.joinWaitlist') : t('groups.tasks.shift.claim')}
            </Button>
          ) : null}
          {state === 'none' ? (
            <Button size="md" variant="secondary" onPress={() => answer('decline')} loading={busy === 'decline'} testID={`shift-decline-${task.id}`}>
              {t('groups.tasks.shift.decline')}
            </Button>
          ) : null}
          {state === 'claimed' || state === 'waitlisted' ? (
            <Button size="md" variant="secondary" onPress={() => answer('withdraw')} loading={busy === 'withdraw'} testID={`shift-withdraw-${task.id}`}>
              {state === 'claimed' ? t('groups.tasks.shift.withdraw') : t('groups.tasks.shift.leaveWaitlist')}
            </Button>
          ) : null}
        </HStack>
      </VStack>
    </Card>
  );
}
