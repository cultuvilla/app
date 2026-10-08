import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { Text, Pressable, FieldLabel } from '../primitives';
import { useT } from '../../lib/i18n';
import { MapLocationPicker } from './MapLocationPicker';

const ACCENT = colors.light.fg.accent;

/**
 * Trigger + full-screen location picker used wherever an entity carries an
 * optional pin (events, places). The picker is a draggable map
 * (`MapLocationPicker`, ported from ordago-apps).
 */
export function LocationField({
  value,
  displayName,
  onChange,
  onClear,
  label,
  required,
  testID,
}: {
  value: LatLng | null;
  displayName: string;
  /** Fired on confirm with the chosen coordinates and its address label. An
   *  empty label is handed up as-is; the form falls back to the village name. */
  onChange: (coords: LatLng, address: string) => void;
  /** Makes the pin removable: when set and a coordinate is stored, the trigger
   *  grows a clear button. Omit where the location is mandatory (events). */
  onClear?: () => void;
  label?: string;
  required?: boolean;
  /** Names the trigger. The picker's own controls keep fixed ids: only one is ever open. */
  testID?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <FieldLabel required={required}>{label ?? t('event.location')}</FieldLabel>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.trigger} testID={testID}>

        <View style={styles.triggerInner}>
          <Ionicons name="location-outline" size={18} color={ACCENT} />
          <Text numberOfLines={1} tone={displayName ? 'primary' : 'muted'} style={styles.triggerText}>
            {displayName || t('event.selectLocation')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#64748b" />
      </Pressable>
      {onClear && value ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t('village.admin.community.removeLocation')}
          hitSlop={8}
          style={styles.clearRow}
          testID="location-clear"
        >
          <Ionicons name="close-circle-outline" size={16} color={ACCENT} />
          <Text variant="bodySm" tone="muted">
            {t('village.admin.community.removeLocation')}
          </Text>
        </Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <MapLocationPicker
          initialCoords={value}
          initialLabel={displayName}
          onConfirm={onChange}
          onClose={() => setOpen(false)}
        />
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
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
    backgroundColor: '#ffffff',
  },
  triggerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  clearRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'flex-start' },
  triggerText: { flexShrink: 1 },
});
