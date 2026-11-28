import { useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { FieldLabel } from './FieldLabel';
import { Button } from './Button';
import { HStack } from './HStack';
import { CalendarDatePicker } from './CalendarDatePicker';
import { dateOfKey, dayKeyOf, formatDayRange, nextRangeSelection, type DayRange } from '../../lib/date/dayRange';
import { useT } from '../../lib/i18n';

const ACCENT = colors.light.fg.accent;

export interface DateRangeFieldProps {
  label: string;
  value: DayRange | null;
  onChange: (range: DayRange) => void;
  /** `YYYY-MM-DD` bounds, inclusive. */
  minDay?: string;
  maxDay?: string;
  /** The month the calendar opens on when nothing is picked yet. */
  initialMonth?: Date;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * A first-and-last-day range picked on one calendar: tap the first day, then
 * the last. The range is only emitted on "Listo", so a half-picked range never
 * reaches the form.
 */
export function DateRangeField({
  label,
  value,
  onChange,
  minDay,
  maxDay,
  initialMonth,
  placeholder = 'Elegir fechas',
  disabled = false,
  testID,
}: DateRangeFieldProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ startDay: string | null; endDay: string | null }>({ startDay: null, endDay: null });

  function openPicker() {
    setDraft(value ?? { startDay: null, endDay: null });
    setOpen(true);
  }

  function confirm() {
    if (draft.startDay === null || draft.endDay === null) return;
    onChange({ startDay: draft.startDay, endDay: draft.endDay });
    setOpen(false);
  }

  const hint =
    draft.startDay === null ? t('common.dateRange.pickFirstDay') : draft.endDay === null ? t('common.dateRange.pickLastDay') : formatDayRange({ startDay: draft.startDay, endDay: draft.endDay });

  return (
    <View testID={testID}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        testID={testID ? `${testID}-trigger` : undefined}
        style={[styles.trigger, disabled ? styles.disabled : null]}
      >
        <Text numberOfLines={1} tone={value ? 'primary' : 'muted'} style={styles.triggerText}>
          {value ? formatDayRange(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={ACCENT} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text variant="h3">{label}</Text>
            <Text tone="muted" testID={testID ? `${testID}-hint` : undefined}>
              {hint}
            </Text>
          </View>
          <CalendarDatePicker
            testID={testID ? `${testID}-calendar` : undefined}
            value={draft.startDay ? dateOfKey(draft.startDay) : null}
            rangeEnd={draft.endDay ? dateOfKey(draft.endDay) : null}
            initialMonth={initialMonth}
            onChange={(day) => setDraft((d) => nextRangeSelection(d, dayKeyOf(day)))}
            minDate={minDay ? dateOfKey(minDay) : undefined}
            maxDate={maxDay ? dateOfKey(maxDay) : undefined}
          />
          <HStack gap={2} justify="end" className="pt-3">
            <Button variant="secondary" onPress={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onPress={confirm}
              disabled={draft.startDay === null || draft.endDay === null}
              testID={testID ? `${testID}-confirm` : undefined}
            >
              {t('common.done')}
            </Button>
          </HStack>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.light.border.input,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
    backgroundColor: colors.light.bg['surface-elevated'],
  },
  disabled: { opacity: 0.5 },
  triggerText: { flexShrink: 1, marginRight: 8 },
  modal: { flex: 1, padding: 16 },
  modalHeader: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.light.border.divider },
});
