import { useState } from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '@cultuvilla/shared/utils/format';
import { colors } from '@cultuvilla/shared/design-system';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { FieldLabel } from './FieldLabel';
import { Button } from './Button';
import { CalendarDatePicker } from './CalendarDatePicker';

const ACCENT = colors.light.fg.accent;

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date | null) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
}

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  testID,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  function pickDay(day: Date) {
    onChange(day);
    setOpen(false);
  }

  const triggerText = value ? formatDate(value, 'short') : 'Seleccionar fecha';

  return (
    <View testID={testID}>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        testID={testID ? `${testID}-trigger` : undefined}
        style={styles.trigger}
      >
        <Text numberOfLines={1} tone={value ? 'primary' : 'muted'} style={styles.triggerText}>
          {triggerText}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={ACCENT} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text variant="h3">{label}</Text>
          </View>
          <CalendarDatePicker
            testID={testID ? `${testID}-calendar` : undefined}
            value={value}
            onChange={pickDay}
            minDate={minimumDate}
            maxDate={maximumDate}
          />
          <View style={styles.modalActions}>
            <Button variant="secondary" onPress={() => setOpen(false)}>
              Cancelar
            </Button>
          </View>
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
  triggerText: { flexShrink: 1, marginRight: 8 },
  modal: { flex: 1, padding: 16 },
  modalHeader: { paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.light.border.divider },
  modalActions: { paddingTop: 12, flexDirection: 'row', justifyContent: 'flex-end' },
});
