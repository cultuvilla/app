import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';
import {
  MAX_RECURRENCE_INTERVAL,
  MAX_SHIFT_SLOTS,
  type RecurrenceKind,
  type RecurrenceUnit,
  type TaskRecurrence,
} from '@cultuvilla/shared/models/organization';
import { createGroupTask, updateGroupTask, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { DateField, Input, Text, Toggle, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { FormModal } from '../../layout/FormModal';
import { Stepper, type StepConfig } from '../Stepper';
import { PersonCheckbox } from './PersonCheckbox';
import { useT } from '../../../lib/i18n';
import { showAlert } from '../../../lib/dialogs';
import { dayKeyOfPickedDate, pickedDateOfDayKey } from '../../../lib/orgs/cuota';
import { parseIntIn, parseTimeOfDay } from '../../../lib/orgs/tasks';
import type { GroupMember } from '../../../lib/orgs/useOrgMembers';

type Repeat = 'none' | RecurrenceKind;

function stepBody(children: ReactNode) {
  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      <VStack gap={3} className="px-4 pt-4 pb-6">
        {children}
      </VStack>
    </ScrollView>
  );
}

interface Errors {
  time?: string;
  slots?: string;
  interval?: string;
  due?: string;
}

/**
 * Any member: create or edit one task, in three steps — what it is; when it is
 * and whether it repeats on a fixed date or some time after it was done; and
 * who is in charge of it, and whether it still looks for volunteers and how
 * many more. A new task can be put on an event's checklist. Deleting is on the
 * task's own screen.
 */
export function TaskSheet({
  visible,
  orgId,
  uid,
  task,
  eventId = null,
  members,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  uid: string;
  /** null = a new task. */
  task: GroupTask | null;
  eventId?: string | null;
  members: GroupMember[];
  onClose: () => void;
}) {
  const { t } = useT();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [time, setTime] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [isShift, setIsShift] = useState(false);
  const [slots, setSlots] = useState('');
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [unit, setUnit] = useState<RecurrenceUnit>('year');
  const [interval, setInterval] = useState('1');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setNotes(task?.notes ?? '');
    setDueOn(task?.dueOn ?? null);
    setTime(task?.time ?? '');
    setAssignees(task?.assigneeUids ?? []);
    setIsShift(task ? task.slots !== null : false);
    setSlots(task?.slots ? String(task.slots) : '');
    setRepeat(task?.recurrence?.kind ?? 'none');
    setUnit(task?.recurrence?.unit ?? 'year');
    setInterval(String(task?.recurrence?.interval ?? 1));
  }, [visible, task]);

  const toggleAssignee = (memberUid: string, on: boolean) =>
    setAssignees((prev) => (on ? [...prev, memberUid] : prev.filter((u) => u !== memberUid)));

  // Worked out on every render: the stepper keeps a step's Siguiente off while
  // it has an error, and a field shows its own once there is something to judge.
  const parsedTime = time.trim() ? parseTimeOfDay(time) : null;
  const parsedSlots = isShift ? parseIntIn(slots, 1, MAX_SHIFT_SLOTS) : null;
  const parsedInterval = repeat === 'none' ? null : parseIntIn(interval, 1, MAX_RECURRENCE_INTERVAL);
  const errors: Errors = {};
  if (time.trim() && !parsedTime) errors.time = t('groups.tasks.form.timeInvalid');
  if (repeat !== 'none' && parsedInterval === null) errors.interval = t('groups.tasks.form.intervalInvalid');
  if (repeat === 'calendar' && !dueOn) errors.due = t('groups.tasks.form.calendarNeedsDate');
  if (isShift && parsedSlots === null) errors.slots = t('groups.tasks.form.slotsInvalid');
  if (isShift && parsedSlots !== null && task && parsedSlots < task.claimedUids.length) {
    errors.slots = t('groups.tasks.form.slotsBelowClaimed', { count: task.claimedUids.length });
  }
  const shiftNeedsDate = isShift && !dueOn;

  const save = () => {
    const recurrence: TaskRecurrence | null =
      repeat === 'none' || parsedInterval === null
        ? null
        : {
            kind: repeat,
            unit,
            interval: parsedInterval,
            // Keep the series' first day while its rule is unchanged, so "the 31st" stays the 31st.
            anchorOn:
              repeat === 'calendar'
                ? task?.recurrence?.kind === 'calendar' && task.recurrence.unit === unit && task.recurrence.anchorOn
                  ? task.recurrence.anchorOn
                  : dueOn
                : null,
          };
    const fields = {
      title,
      notes: notes.trim() ? notes : null,
      assigneeUids: assignees,
      dueOn,
      time: parsedTime,
      slots: parsedSlots,
      recurrence,
      eventId: task ? task.eventId : eventId,
    };
    setSaving(true);
    (task ? updateGroupTask(orgId, task.id, fields) : createGroupTask(orgId, fields, uid).then(() => undefined))
      .then(onClose)
      .catch(() => showAlert(t('groups.tasks.error')))
      .finally(() => setSaving(false));
  };

  const steps: StepConfig[] = [
    {
      key: 'what',
      title: t('groups.tasks.form.stepWhat'),
      icon: 'create-outline',
      validate: () => (title.trim() ? [] : ['title']),
      render: () =>
        stepBody(
          <>
            <Input label={t('groups.tasks.form.name')} value={title} onChangeText={setTitle} testID="task-title" />
            <Input label={t('groups.tasks.form.notes')} value={notes} onChangeText={setNotes} autoGrow testID="task-notes" />
          </>,
        ),
    },
    {
      key: 'when',
      title: t('groups.tasks.form.stepWhen'),
      icon: 'calendar-outline',
      validate: () => [errors.time, errors.interval, errors.due].filter((e): e is string => e !== undefined),
      render: () =>
        stepBody(
          <>
            <DateField
              label={t('groups.tasks.form.due')}
              value={dueOn ? pickedDateOfDayKey(dueOn) : null}
              onChange={(d) => setDueOn(d ? dayKeyOfPickedDate(d) : null)}
              testID="task-due"
            />
            {errors.due ? (
              <Text variant="bodySm" tone="danger" testID="task-due-error">
                {errors.due}
              </Text>
            ) : null}
            <Input label={t('groups.tasks.form.time')} value={time} onChangeText={setTime} error={errors.time} testID="task-time" />
            <Text variant="bodySm" className="font-bold">
              {t('groups.tasks.form.repeat')}
            </Text>
            <SegmentedToggle
              testID="task-repeat"
              value={repeat}
              options={[
                { value: 'none', label: t('groups.tasks.form.repeatNone') },
                { value: 'calendar', label: t('groups.tasks.form.repeatCalendar') },
                { value: 'afterDone', label: t('groups.tasks.form.repeatAfterDone') },
              ]}
              onChange={setRepeat}
            />
            {repeat !== 'none' ? (
              <>
                <SegmentedToggle
                  testID="task-repeat-unit"
                  value={unit}
                  options={[
                    { value: 'month', label: t('groups.tasks.form.unit.month') },
                    { value: 'year', label: t('groups.tasks.form.unit.year') },
                  ]}
                  onChange={setUnit}
                />
                <Input
                  label={t('groups.tasks.form.every')}
                  value={interval}
                  onChangeText={setInterval}
                  keyboardType="number-pad"
                  error={errors.interval}
                  testID="task-repeat-interval"
                />
              </>
            ) : null}
          </>,
        ),
    },
    {
      key: 'who',
      title: t('groups.tasks.form.stepWho'),
      icon: 'people-outline',
      validate: () => [errors.slots, shiftNeedsDate ? 'due' : undefined].filter((e): e is string => e !== undefined),
      render: () =>
        stepBody(
          <>
            <VStack gap={1} testID="task-assignees">
              <Text variant="bodySm" className="font-bold">
                {t('groups.tasks.form.assignees')}
              </Text>
              {members.map((m) => (
                <PersonCheckbox
                  key={m.uid}
                  name={m.name}
                  photoURL={m.photoURL}
                  value={assignees.includes(m.uid)}
                  onValueChange={(on) => toggleAssignee(m.uid, on)}
                  testID={`task-assignee-${m.uid}`}
                />
              ))}
            </VStack>
            {/* Encargados and a call for more volunteers can go together. */}
            <Toggle label={t('groups.tasks.form.isShift')} value={isShift} onValueChange={setIsShift} testID="task-is-shift" />
            {isShift ? (
              <>
                <Input
                  label={t('groups.tasks.form.slots')}
                  value={slots}
                  onChangeText={setSlots}
                  keyboardType="number-pad"
                  error={slots.trim() ? errors.slots : undefined}
                  testID="task-slots"
                />
                {shiftNeedsDate ? (
                  <Text variant="bodySm" tone="danger" testID="task-shift-due-error">
                    {t('groups.tasks.form.shiftNeedsDate')}
                  </Text>
                ) : null}
              </>
            ) : null}
          </>,
        ),
    },
  ];

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t(task ? 'groups.tasks.form.titleEdit' : 'groups.tasks.form.titleNew')}
      testID="task-sheet"
    >
      <Stepper
        steps={steps}
        onComplete={save}
        submitLabel={t('groups.tasks.form.save')}
        loading={saving}
        allStepsReachable={task !== null}
        primaryTestID="task-next"
        submitTestID="task-save"
      />
    </FormModal>
  );
}
