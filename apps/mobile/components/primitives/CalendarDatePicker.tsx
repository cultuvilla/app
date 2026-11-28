import { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { monthShortLabels, weekdayShortLabels } from '@cultuvilla/shared/utils/format';
import { iconSizes } from '@cultuvilla/shared/design-system';
import { Pressable } from './Pressable';
import { Text } from './Text';
import {
  buildMonthMatrix,
  isSameDay,
  isDayDisabled,
  clampMonth,
} from '../../lib/date/calendarGrid';

const WEEKDAYS = weekdayShortLabels();
const MONTHS = monthShortLabels(); // es-ES, single locale source

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export interface CalendarDatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  /** Marks `value` as the first day of a range ending here, and fills the days between. */
  rangeEnd?: Date | null;
  /** The month shown first when there is no `value` yet. */
  initialMonth?: Date;
  minDate?: Date;
  maxDate?: Date;
  testID?: string;
}

export function CalendarDatePicker({
  value,
  onChange,
  rangeEnd,
  initialMonth,
  minDate,
  maxDate,
  testID,
}: CalendarDatePickerProps) {
  const anchor = value ?? initialMonth ?? new Date();
  const [view, setView] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });
  const [jump, setJump] = useState(false);

  const cells = buildMonthMatrix(view.year, view.month);
  const go = (delta: number) => setView((v) => clampMonth(v.year, v.month + delta));

  const minYear = (minDate ?? new Date(1900, 0, 1)).getFullYear();
  const maxYear = (maxDate ?? new Date(anchor.getFullYear() + 5, 11, 31)).getFullYear();
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push(y);

  if (jump) {
    return (
      <View testID={testID}>
        <ScrollView className="max-h-48">
          {years.map((y) => (
            <Pressable
              key={y}
              testID={testID ? `${testID}-year-${y}` : undefined}
              onPress={() => setView((v) => ({ ...v, year: y }))}
              className="items-center py-2"
            >
              <Text tone={y === view.year ? 'primary' : 'muted'}>{y}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View className="flex-row flex-wrap">
          {MONTHS.map((m, i) => (
            <Pressable
              key={m}
              testID={testID ? `${testID}-month-${i}` : undefined}
              onPress={() => {
                setView((v) => ({ ...v, month: i }));
                setJump(false);
              }}
              className="w-1/4 items-center py-2"
            >
              <Text tone={i === view.month ? 'primary' : 'muted'}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View testID={testID}>
      <View className="flex-row items-center justify-between px-2 py-2">
        <Pressable testID={testID ? `${testID}-prev` : undefined} onPress={() => go(-1)}>
          <Ionicons name="chevron-back" size={iconSizes.md} />
        </Pressable>
        <Pressable testID={testID ? `${testID}-title` : undefined} onPress={() => setJump(true)}>
          <Text variant="h3">{`${MONTHS[view.month]} ${view.year}`}</Text>
        </Pressable>
        <Pressable testID={testID ? `${testID}-next` : undefined} onPress={() => go(1)}>
          <Ionicons name="chevron-forward" size={iconSizes.md} />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAYS.map((w) => (
          <Text key={w} className="flex-1 text-center" tone="muted">
            {w}
          </Text>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map(({ date, inMonth }) => {
          const disabled = isDayDisabled(date, minDate, maxDate);
          const selected =
            (value != null && isSameDay(date, value)) || (rangeEnd != null && isSameDay(date, rangeEnd));
          const between =
            !selected && value != null && rangeEnd != null && date > value && date < rangeEnd;
          return (
            <Pressable
              key={iso(date)}
              testID={testID ? `${testID}-day-${iso(date)}` : undefined}
              disabled={disabled}
              onPress={() =>
                onChange(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
              }
              accessibilityState={{ selected, disabled }}
              className={`items-center justify-center rounded-full ${selected ? 'bg-accent' : between ? 'bg-accent-subtle' : ''}`}
              style={{ width: `${100 / 7}%`, height: 40 }}
            >
              <Text tone={selected ? 'onAccent' : disabled || !inMonth ? 'muted' : 'primary'}>
                {date.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
