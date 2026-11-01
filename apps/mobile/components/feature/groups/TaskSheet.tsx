import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  MAX_RECURRENCE_INTERVAL,
  MAX_SHIFT_SLOTS,
  type RecurrenceKind,
  type RecurrenceUnit,
  type TaskRecurrence,
} from '@cultuvilla/shared/models/organization';
import { createGroupTask, deleteGroupTask, updateGroupTask, type GroupTask } from '@cultuvilla/shared/services/groupTaskService';
import { Button, Checkbox, DateField, Input, Text, Toggle, VStack } from '../../primitives';
import { SegmentedToggle } from '../SegmentedToggle';
import { FormModal } from '../../layout/FormModal';
import { TaskComments } from './TaskComments';
import { useT } from '../../../lib/i18n';
import { showAlert, showConfirm } from '../../../lib/dialogs';
import { dayKeyOfPickedDate, pickedDateOfDayKey } from '../../../lib/orgs/cuota';
import { parseIntIn, parseTimeOfDay } from '../../../lib/orgs/tasks';
import type { GroupMember } from '../../../lib/orgs/useOrgMembers';

type Repeat = 'none' | RecurrenceKind;

interface Errors {
  title?: string;
  time?: string;
  slots?: string;
  interval?: string;
  due?: string;
}

/**
 * Any member: create or edit one task — what, when, who, whether it is a volunteer
 * shift (and how many people it needs), and whether it repeats on a fixed date
 * or some time after it was done. A new task can be put on an event's checklist.
 * An existing task also has its comments, on a second tab.
 */
export function TaskSheet({
  visible,
  orgId,
  uid,
  task,
  eventId = null,
  members,
  canDelete = false,
  isAdmin = false,
  onClose,
}: {
  visible: boolean;
  orgId: string;
  uid: string;
  /** null = a new task. */
  task: GroupTask | null;
  eventId?: string | null;
  members: GroupMember[];
  /** An admin, or whoever created the task. */
  canDelete?: boolean;
  /** May delete anyone's comment. */
  isAdmin?: boolean;
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
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'details' | 'comments'>('details');
  const showComments = task !== null && tab === 'comments';

  useEffect(() => {
    if (!visible) return;
    setTab('details');
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
    setErrors({});
  }, [visible, task]);

  const toggleAssignee = (memberUid: string, on: boolean) =>
    setAssignees((prev) => (on ? [...prev, memberUid] : prev.filter((u) => u !== memberUid)));

  const save = () => {
    const next: Errors = {};
    const parsedTime = time.trim() ? parseTimeOfDay(time) : null;
    if (!title.trim()) next.title = t('groups.tasks.form.nameRequired');
    if (time.trim() && !parsedTime) next.time = t('groups.tasks.form.timeInvalid');
    const parsedSlots = isShift ? parseIntIn(slots, 1, MAX_SHIFT_SLOTS) : null;
    if (isShift && parsedSlots === null) next.slots = t('groups.tasks.form.slotsInvalid');
    if (isShift && parsedSlots !== null && task && parsedSlots < task.claimedUids.length) {
      next.slots = t('groups.tasks.form.slotsBelowClaimed', { count: task.claimedUids.length });
    }
    if (isShift && !dueOn) next.due = t('groups.tasks.form.shiftNeedsDate');
    const parsedInterval = repeat === 'none' ? null : parseIntIn(interval, 1, MAX_RECURRENCE_INTERVAL);
    if (repeat !== 'none' && parsedInterval === null) next.interval = t('groups.tasks.form.intervalInvalid');
    if (repeat === 'calendar' && !dueOn) next.due = t('groups.tasks.form.calendarNeedsDate');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

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
      // A shift is filled by volunteers, not assigned.
      assigneeUids: isShift ? [] : assignees,
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

  const remove = () => {
    if (!task) return;
    showConfirm(
      t('groups.tasks.form.delete'),
      t('groups.tasks.deleteConfirm'),
      () => {
        deleteGroupTask(orgId, task.id)
          .then(onClose)
          .catch(() => showAlert(t('groups.tasks.error')));
      },
      { confirmText: t('common.delete'), cancelText: t('common.cancel') },
    );
  };

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      title={t(task ? 'groups.tasks.form.titleEdit' : 'groups.tasks.form.titleNew')}
      testID="task-sheet"
      footer={
        showComments ? undefined : (
          <VStack gap={2} className="px-5 pt-3">
            <Button onPress={save} loading={saving} fullWidth testID="task-save">
              {t('groups.tasks.form.save')}
            </Button>
            {task && canDelete ? (
              <Button variant="ghost" onPress={remove} fullWidth testID="task-delete">
                {t('groups.tasks.form.delete')}
              </Button>
            ) : null}
          </VStack>
        )
      }
    >
      {task ? (
        <View className="px-4 pt-3">
          <SegmentedToggle
            testID="task-tab"
            value={tab}
            options={[
              { value: 'details', label: t('groups.tasks.comments.tabDetails') },
              { value: 'comments', label: t('groups.tasks.comments.tabComments') },
            ]}
            onChange={setTab}
          />
        </View>
      ) : null}
      {showComments ? (
        <TaskComments orgId={orgId} taskId={task.id} uid={uid} isAdmin={isAdmin} />
      ) : (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          <VStack gap={3} className="px-4 pt-4 pb-6">
            <Input label={t('groups.tasks.form.name')} value={title} onChangeText={setTitle} error={errors.title} testID="task-title" />
            <Input label={t('groups.tasks.form.notes')} value={notes} onChangeText={setNotes} autoGrow testID="task-notes" />
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

            <Toggle label={t('groups.tasks.form.isShift')} value={isShift} onValueChange={setIsShift} testID="task-is-shift" />
            {isShift ? (
              <Input
                label={t('groups.tasks.form.slots')}
                value={slots}
                onChangeText={setSlots}
                keyboardType="number-pad"
                error={errors.slots}
                testID="task-slots"
              />
            ) : (
              <VStack gap={1} testID="task-assignees">
                <Text variant="bodySm" className="font-bold">
                  {t('groups.tasks.form.assignees')}
                </Text>
                {members.map((m) => (
                  <Checkbox
                    key={m.uid}
                    label={m.name}
                    value={assignees.includes(m.uid)}
                    onValueChange={(on) => toggleAssignee(m.uid, on)}
                    testID={`task-assignee-${m.uid}`}
                  />
                ))}
              </VStack>
            )}

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
          </VStack>
        </ScrollView>
      )}
    </FormModal>
  );
}
