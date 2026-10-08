import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Modal, TextInput, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  searchMunicipalities,
  getMunicipality,
} from '@cultuvilla/shared/services/municipalityService';
import { escudoThumbDisplayUrl } from '@cultuvilla/shared/models/municipality';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { FieldLabel } from './FieldLabel';
import { Button } from './Button';
import { Escudo } from './Escudo';

interface Option {
  id: string;
  name: string;
  province: string;
  escudoThumbUrl: string | null;
}

export interface VillagePickerProps {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  /**
   * Render a custom control that opens the search modal, replacing the default
   * label + bordered trigger row. `open` shows the picker. Used e.g. for an
   * "add" affordance instead of a field-style trigger.
   */
  trigger?: (open: () => void) => ReactNode;
  /** Names the trigger; the modal's search, rows and buttons derive from it. */
  testID?: string;
}

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 200;

export function VillagePicker({ label, value, onChange, placeholder = 'Sin pueblo', trigger, testID }: VillagePickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [results, setResults] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);

  // Fetch + cache the selected municipality (one doc) so the trigger
  // renders correctly even when the modal is closed.
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    let cancelled = false;
    getMunicipality(value).then((m) => {
      if (cancelled || !m) return;
      setSelected({
        id: m.id,
        name: m.name,
        province: m.province,
        escudoThumbUrl: escudoThumbDisplayUrl(m),
      });
    });
    return () => { cancelled = true; };
  }, [value, selected?.id]);

  // Run search on modal open + on each (debounced) filter change.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const list = await searchMunicipalities(filter, PAGE_SIZE);
      if (cancelled) return;
      setResults(
        list.map((m) => ({
          id: m.id,
          name: m.name,
          province: m.province,
          escudoThumbUrl: escudoThumbDisplayUrl(m),
        })),
      );
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, filter]);

  return (
    <View>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <>
          <FieldLabel>{label}</FieldLabel>
          <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.trigger} testID={testID}>
            <View style={styles.triggerInner}>
              {selected && (
                <Escudo url={selected.escudoThumbUrl} size={28} fallbackInitial={selected.name} />
              )}
              <Text>{selected ? `${selected.name} (${selected.province})` : placeholder}</Text>
            </View>
            <Ionicons name="chevron-down" size={16} color="#64748b" />
          </Pressable>
        </>
      )}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal} edges={['top', 'bottom']}>
          <TextInput
            placeholder="Buscar pueblo"
            value={filter}
            onChangeText={setFilter}
            style={styles.search}
            autoCapitalize="none"
            testID={testID ? `${testID}-search` : undefined}
          />
          {loading && results.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(o) => o.id}
              initialNumToRender={20}
              windowSize={10}
              ListEmptyComponent={
                <Text tone="muted" style={styles.empty}>Sin resultados</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                    setFilter('');
                  }}
                  style={styles.row}
                  testID={testID ? `${testID}-option-${item.id}` : undefined}
                >
                  <Escudo url={item.escudoThumbUrl} size={36} fallbackInitial={item.name} />
                  <View style={styles.rowText}>
                    <Text>{item.name}</Text>
                    <Text tone="muted" variant="caption">{item.province}</Text>
                  </View>
                </Pressable>
              )}
            />
          )}
          <View style={styles.actions}>
            {value && (
              <Button variant="secondary" onPress={() => { onChange(null); setOpen(false); }} testID={testID ? `${testID}-clear` : undefined}>
                Quitar
              </Button>
            )}
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
  triggerInner: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  modal: { flex: 1, padding: 16, gap: 12 },
  search: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', paddingVertical: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  rowText: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
