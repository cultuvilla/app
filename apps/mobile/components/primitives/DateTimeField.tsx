import { useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@cultuvilla/shared/utils/format';
import { colors } from '@cultuvilla/shared/design-system';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Card } from './Card';
import { FieldLabel } from './FieldLabel';
import { Button } from './Button';
import { CalendarDatePicker } from './CalendarDatePicker';
import { ClockTimePicker } from './ClockTimePicker';

const ACCENT = colors.light.fg.accent;

export interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Minute granularity for the clock. Defaults to 5. */
  minuteStep?: number;
  /**
   * Time only: the date button is hidden and picking a time keeps `value`'s
   * day (or `minimumDate`'s, while empty). For a time slot on a day chosen
   * elsewhere.
   */
  timeOnly?: boolean;
  /** Fallback placeholder for both buttons. */
  placeholder?: string;
  /** Placeholder shown on the date button when empty. Falls back to `placeholder`. */
  datePlaceholder?: string;
  /** Placeholder shown on the time button when empty. Falls back to `placeholder`. */
  timePlaceholder?: string;
  testID?: string;
}

type ActiveModal = 'date' | 'time' | null;

function defaultDraft(minimumDate?: Date): Date {
  const base = minimumDate && minimumDate.getTime() > Date.now() ? new Date(minimumDate) : new Date();
  base.setSeconds(0, 0);
  return base;
}

/**
 * Date + time picker: two side-by-side buttons, each opening a compact centered
 * dialog — the calendar grid for the date, the tap-only clock for the time.
 * Picking a date preserves the time and vice versa, so the two buttons compose
 * onto the same underlying value.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  minuteStep = 5,
  timeOnly = false,
  placeholder,
  datePlaceholder,
  timePlaceholder,
  testID,
}: DateTimeFieldProps) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const insets = useSafeAreaInsets();
  const current = value ?? defaultDraft(minimumDate);

  // The clock's own hour tap doesn't round-trip through the parent's `value`
  // prop before the minute tap fires (the modal stays open in between), so we
  // track the in-progress edit locally and seed it fresh each time the time
  // dialog opens.
  const [timeDraft, setTimeDraft] = useState<Date>(current);

  function pickDate(day: Date) {
    const merged = new Date(current);
    merged.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    onChange(merged);
    setActiveModal(null);
  }

  function openTime() {
    setTimeDraft(current);
    setActiveModal('time');
  }

  // Hour and minute taps both update the value; only a minute tap commits
  // (fires onCommit), so an hour tap keeps the clock open on its minute page.
  function updateTime(time: Date) {
    setTimeDraft(time);
    onChange(time);
  }

  const dateText = value ? formatDate(value, 'dayMonth') : (datePlaceholder ?? placeholder ?? 'Fecha');
  const timeText = value ? formatDate(value, 'time') : (timePlaceholder ?? placeholder ?? 'Hora');

  function dialog(children: React.ReactNode) {
    return (
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={() => setActiveModal(null)}
        >
          <View />
        </Pressable>
        <Card variant="elevated" className="w-full max-w-sm" testID={testID ? `${testID}-dialog` : undefined}>
          <View style={[styles.dialogInner, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <Text variant="h3">{label}</Text>
            {children}
            <View style={styles.dialogActions}>
              <Button variant="secondary" onPress={() => setActiveModal(null)}>
                Cancelar
              </Button>
            </View>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View testID={testID}>
      <FieldLabel>{label}</FieldLabel>
      <View className="flex-row gap-3" style={styles.row}>
        {timeOnly ? null : (
        <Pressable
          onPress={() => setActiveModal('date')}
          accessibilityRole="button"
          testID={testID ? `${testID}-date` : undefined}
          className="flex-1"
          style={[styles.trigger, { flex: 1 }]}
        >
          <Ionicons name="calendar-outline" size={18} color={ACCENT} />
          <Text numberOfLines={1} tone={value ? 'primary' : 'muted'} style={styles.triggerText}>
            {dateText}
          </Text>
        </Pressable>
        )}
        <Pressable
          onPress={openTime}
          accessibilityRole="button"
          testID={testID ? `${testID}-time` : undefined}
          className="flex-1"
          style={[styles.trigger, { flex: 1 }]}
        >
          <Ionicons name="time-outline" size={18} color={ACCENT} />
          <Text numberOfLines={1} tone={value ? 'primary' : 'muted'} style={styles.triggerText}>
            {timeText}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={activeModal === 'date'}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        {dialog(
          <CalendarDatePicker
            testID={testID ? `${testID}-date-calendar` : undefined}
            value={current}
            onChange={pickDate}
            minDate={minimumDate}
            maxDate={maximumDate}
          />,
        )}
      </Modal>

      <Modal
        visible={activeModal === 'time'}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        {dialog(
          <ClockTimePicker
            testID={testID ? `${testID}-time-picker` : undefined}
            value={timeDraft}
            onChange={updateTime}
            onCommit={() => setActiveModal(null)}
            minuteStep={minuteStep}
          />,
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: 4 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  triggerText: { flexShrink: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 16,
  },
  dialogInner: { gap: 12 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
