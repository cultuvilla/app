import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LatLng } from '@cultuvilla/shared/models/core/LocationDataModel';
import { Pressable, Text, FieldLabel, Escudo } from '../primitives';
import { useT } from '../../lib/i18n';

export interface VillageOption {
  id: string;
  /** The pueblo's URL slug — what a link to anything created here is built from. */
  slug: string;
  name: string;
  province: string;
  coordinates: LatLng | null;
  escudoThumbUrl: string | null;
}

/**
 * Inline village dropdown limited to the villages the current user has joined —
 * the event's `municipalityId` must be one the creator is a member of (enforced
 * by the Firestore create rule). Auto-selection by proximity to the picked
 * coordinates is done by the parent; this is the manual override. The list
 * expands in place (no full-screen modal). Rendered read-only in edit mode,
 * since the rules forbid changing an event's municipality after creation.
 */
export function MyVillagePicker({
  label,
  villages,
  value,
  onChange,
  disabled = false,
  hint,
  testID,
}: {
  label: string;
  villages: VillageOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  hint?: string;
  /** Names the trigger (also the read-only box in edit mode) and each row, `<id>-option-<villageId>`. */
  testID: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const selected = villages.find((v) => v.id === value) ?? null;

  const selectedRow = (
    <View style={styles.triggerInner}>
      {selected && <Escudo url={selected.escudoThumbUrl} size={28} fallbackInitial={selected.name} />}
      <Text tone={selected ? 'primary' : 'muted'}>
        {selected ? `${selected.name} (${selected.province})` : t('event.selectLocation')}
      </Text>
    </View>
  );

  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      {disabled ? (
        <View style={[styles.trigger, styles.triggerDisabled]} testID={testID}>{selectedRow}</View>
      ) : (
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          testID={testID}
          style={styles.trigger}
        >
          {selectedRow}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
        </Pressable>
      )}

      {/* Inline expanded list */}
      {!disabled && open ? (
        <View style={styles.list}>
          {villages.length === 0 ? (
            <Text tone="muted" style={styles.empty}>{t('event.noVillages')}</Text>
          ) : (
            villages.map((v, i) => (
              <Pressable
                key={v.id}
                onPress={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
                testID={`${testID}-option-${v.id}`}
                style={[styles.row, i > 0 && styles.rowBorder]}
              >
                <Escudo url={v.escudoThumbUrl} size={32} fallbackInitial={v.name} />
                <View style={styles.rowText}>
                  <Text>{v.name}</Text>
                  <Text tone="muted" variant="caption">{v.province}</Text>
                </View>
                {v.id === value ? <Ionicons name="checkmark" size={20} color="#16a34a" /> : null}
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {hint ? <Text variant="caption" tone="muted" style={styles.hint}>{hint}</Text> : null}
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
  triggerDisabled: { backgroundColor: '#f8fafc' },
  triggerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  list: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  empty: { padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  rowText: { flex: 1 },
  hint: { marginTop: 4 },
});
