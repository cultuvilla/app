import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { monthLongLabels } from '@cultuvilla/shared/utils';
import { Button, DateField, HStack, Input, Pressable, Text, VStack } from '../primitives';
import { SelectField } from './groups/SelectField';
import { useT } from '../../lib/i18n';

/** One row of the event form's Tareas step, before it is a group task. */
export interface EventTaskDraft {
  key: string;
  title: string;
  /** 1–12; asked instead of a date when the event repeats every year. */
  month: number | null;
  dueOn: Date | null;
}

let nextKey = 0;
export function blankEventTask(): EventTaskDraft {
  nextKey += 1;
  return { key: `task-${String(nextKey)}`, title: '', month: null, dueOn: null };
}

/** A titled row still waiting for its month: the step refuses to advance. */
export function eventTasksMissingMonth(rows: readonly EventTaskDraft[]): boolean {
  return rows.some((r) => r.title.trim() !== '' && r.month === null);
}

/**
 * The tasks an event's group should get done for it. A yearly event's tasks
 * are due by a month and come back every year, so each asks for a month; any
 * other event's take an optional date. Assignees and shifts are set later in
 * the group's Tareas screen.
 */
export function EventTasksEditor({
  rows,
  onChange,
  yearly,
}: {
  rows: EventTaskDraft[];
  onChange: (rows: EventTaskDraft[]) => void;
  yearly: boolean;
}) {
  const { t } = useT();
  const months = monthLongLabels();
  const monthOptions = months.map((label, i) => ({ value: String(i + 1), label }));
  const patch = (key: string, change: Partial<EventTaskDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));

  return (
    <VStack gap={4}>
      {yearly ? (
        <Text tone="muted" variant="bodySm">
          {t('event.tasks.yearlyHint')}
        </Text>
      ) : null}
      {rows.map((row, i) => (
        <VStack key={row.key} gap={2} className="border-b border-subtle pb-4">
          <HStack gap={2} className="items-end">
            <VStack gap={0} className="flex-1">
              <Input
                label={t('event.tasks.title', { n: i + 1 })}
                value={row.title}
                onChangeText={(title) => patch(row.key, { title })}
                placeholder={t('event.tasks.titlePlaceholder')}
                maxLength={120}
                testID={`event-task-title-${String(i)}`}
              />
            </VStack>
            <Pressable
              onPress={() => onChange(rows.filter((r) => r.key !== row.key))}
              accessibilityRole="button"
              accessibilityLabel={t('event.tasks.remove')}
              testID={`event-task-remove-${String(i)}`}
              className="p-3"
            >
              <Ionicons name="trash-outline" size={iconSizes.md} color={colors.light.fg.muted} />
            </Pressable>
          </HStack>
          {yearly ? (
            <SelectField
              label={t('event.tasks.month')}
              value={row.month === null ? '' : String(row.month)}
              options={monthOptions}
              onChange={(m) => patch(row.key, { month: Number(m) })}
              placeholder={t('event.tasks.monthPlaceholder')}
              testID={`event-task-month-${String(i)}`}
            />
          ) : (
            <DateField
              label={t('event.tasks.date')}
              value={row.dueOn}
              onChange={(dueOn) => patch(row.key, { dueOn })}
              testID={`event-task-date-${String(i)}`}
            />
          )}
        </VStack>
      ))}
      {yearly && eventTasksMissingMonth(rows) ? (
        <Text tone="danger" variant="bodySm" testID="event-tasks-month-error">
          {t('event.tasks.monthRequired')}
        </Text>
      ) : null}
      <Button variant="secondary" onPress={() => onChange([...rows, blankEventTask()])} testID="event-task-add">
        {t('event.tasks.add')}
      </Button>
    </VStack>
  );
}
