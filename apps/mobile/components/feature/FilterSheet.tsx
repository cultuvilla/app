import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  FlatList,
  TextInput,
  Animated,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.6);
const ACCENT = '#bb5d3a'; // colors.ts: light.bg.accent (terracotta)

export type FilterSheetOption = { value: string; label: string };

export type FilterSheetProps = {
  visible: boolean;
  title: string;
  options: FilterSheetOption[];
  /** Currently selected value, or null for the "all" row. */
  selectedValue: string | null;
  /** Receives the chosen value, or null when the "all" row is tapped. */
  onSelect: (value: string | null) => void;
  onClose: () => void;
  /** Label for the leading "clear / show everything" row. */
  allLabel: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Each row is `<testID>-option-<value>`, the "all" row `<testID>-option-all`. */
  testID?: string;
};

type Row = { value: string | null; label: string };

export function FilterSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  allLabel,
  searchable = false,
  searchPlaceholder,
  testID,
}: FilterSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (visible) {
      setSearch('');
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(SHEET_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  function close(after?: () => void) {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 220, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => {
      onClose();
      after?.();
    });
  }

  const rows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? options.filter((o) => o.label.toLowerCase().includes(q))
      : options;
    return [{ value: null, label: allLabel }, ...filtered];
  }, [options, search, allLabel]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0, 0, 0, 0.5)', opacity: fadeAnim },
        ]}
      >
        <Pressable
          onPress={() => close()}
          accessibilityLabel={title}
          style={StyleSheet.absoluteFill}
        >
          <View />
        </Pressable>
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: SHEET_HEIGHT + insets.bottom,
            backgroundColor: '#ffffff',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              backgroundColor: '#D1D5DB',
              borderRadius: 2,
              alignSelf: 'center',
              marginTop: 12,
              marginBottom: 8,
            }}
          />
          <View className="flex-row items-center justify-between px-4 pb-3 border-b border-subtle">
            <Text variant="h3">{title}</Text>
            <Pressable onPress={() => close()} accessibilityLabel={title} className="p-2 -mr-2">
              <Ionicons name="close" size={24} color="#566047" />
            </Pressable>
          </View>

          {searchable ? (
            <View className="flex-row items-center mx-4 mt-3 px-3 rounded-md border border-subtle bg-surface">
              <Ionicons name="search-outline" size={18} color="#a6a897" />
              <TextInput
                testID={testID ? `${testID}-search` : undefined}
                value={search}
                onChangeText={setSearch}
                placeholder={searchPlaceholder}
                placeholderTextColor="#a6a897"
                style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, color: '#566047' }}
              />
            </View>
          ) : null}

          <FlatList
            data={rows}
            keyExtractor={(r) => r.value ?? '__all__'}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            renderItem={({ item }) => {
              const isSelected = selectedValue === item.value;
              return (
                <Pressable
                  onPress={() => close(() => onSelect(item.value))}
                  testID={testID ? `${testID}-option-${item.value ?? 'all'}` : undefined}
                  className="flex-row items-center justify-between px-5 py-4 border-b border-subtle"
                >
                  <Text tone={isSelected ? 'primary' : 'muted'} className={isSelected ? 'font-bold' : ''}>
                    {item.label}
                  </Text>
                  {isSelected ? <Ionicons name="checkmark" size={20} color={ACCENT} /> : null}
                </Pressable>
              );
            }}
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
