import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBarrios } from '@cultuvilla/shared/services/municipalityService';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { FieldLabel } from './FieldLabel';
import { Button } from './Button';
import { RemoteImage } from './RemoteImage';

interface Option {
  id: string;
  name: string;
  /** The barrio's cover picture (`images[0]`), shown as a small thumbnail. */
  image: string | null;
}

export interface BarrioPickerProps {
  label: string;
  /** Municipality whose barrios are offered. When null the picker is disabled. */
  municipalityId: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  /** Label for the "no specific barrio" choice, e.g. "Todo el pueblo". */
  wholeVillageLabel: string;
  /**
   * Render nothing once it's known the village has no approved barrios — there
   * is nothing to choose, so the control would only offer "whole village"
   * (which is also the null default). Defaults to true; pass false only if a
   * surface must always show the control.
   */
  hideWhenEmpty?: boolean;
  /** Names the trigger; the modal's rows derive from it. */
  testID?: string;
}

export function BarrioPicker({
  label,
  municipalityId,
  value,
  onChange,
  wholeVillageLabel,
  hideWhenEmpty = true,
  testID,
}: BarrioPickerProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);

  // Load the (approved) barrios whenever the municipality changes, so the
  // trigger can render the selected barrio's name even while the modal is
  // closed. Barrio lists are small, so a single fetch per village is fine.
  useEffect(() => {
    if (!municipalityId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBarrios(municipalityId)
      .then((rows) => {
        if (cancelled) return;
        // getBarrios already filters to active barrios server-side.
        setOptions(rows.map((b) => ({ id: b.id, name: b.name, image: b.images[0] ?? null })));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [municipalityId]);

  const disabled = !municipalityId;
  const selected = value ? options.find((o) => o.id === value) ?? null : null;
  const triggerText = disabled
    ? wholeVillageLabel
    : selected
      ? selected.name
      : wholeVillageLabel;

  // Nothing to choose: a village with no approved barrios offers only "whole
  // village", so the caller may opt to drop the control entirely.
  if (hideWhenEmpty && municipalityId && !loading && options.length === 0) {
    return null;
  }

  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        disabled={disabled}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        testID={testID}
      >
        <Text tone={disabled ? 'muted' : undefined}>{triggerText}</Text>
        <Ionicons name="chevron-down" size={16} color="#64748b" />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          {loading && options.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={options}
              keyExtractor={(o) => o.id}
              ListHeaderComponent={
                <Pressable
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  style={styles.row}
                  testID={testID ? `${testID}-option-whole` : undefined}
                >
                  <View style={styles.thumbPlaceholder}>
                    <Ionicons name="albums-outline" size={18} color="#94a3b8" />
                  </View>
                  <Text>{wholeVillageLabel}</Text>
                </Pressable>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  style={styles.row}
                  testID={testID ? `${testID}-option-${item.id}` : undefined}
                >
                  {item.image ? (
                    <RemoteImage
                      uri={item.image}
                      variant="thumb"
                      style={styles.thumb}
                      contentFit="cover"
                      transitionMs={0}
                    />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons name="map-outline" size={18} color="#94a3b8" />
                    </View>
                  )}
                  <Text>{item.name}</Text>
                </Pressable>
              )}
            />
          )}
          <View style={styles.actions}>
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
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
    backgroundColor: '#ffffff',
  },
  triggerDisabled: { backgroundColor: '#f3f4f6' },
  modal: { flex: 1, padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
