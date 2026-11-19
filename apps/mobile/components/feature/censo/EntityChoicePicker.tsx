import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, radii, spacing } from '@cultuvilla/shared/design-system';
import { BottomSheet, Button, Pressable, Text } from '../../primitives';
import { useT } from '../../../lib/i18n';
import type { ChoiceOption } from './ChoiceList';
import { RemoteImage } from '../../primitives/RemoteImage';

export interface EntityChoicePickerProps {
  title: string;
  options: ChoiceOption[];
  mode: 'single' | 'multi';
  value: string | string[] | undefined;
  onChange: (next: string | string[]) => void;
}

export function EntityChoicePicker({
  title,
  options,
  mode,
  value,
  onChange,
}: EntityChoicePickerProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const selectedValues = Array.isArray(value)
    ? value
    : value !== undefined
      ? [value]
      : [];
  const selected = options.filter((option) => selectedValues.includes(option.value));
  const firstSelected = selected[0];
  const triggerLabel = selected.length === 0
    ? t('censo.entityPicker.placeholder')
    : selected.length === 1 && firstSelected
      ? firstSelected.label
      : t('censo.entityPicker.selectedCount', { count: selected.length });

  function select(option: ChoiceOption) {
    if (option.disabled) return;
    if (mode === 'single') {
      onChange(option.value);
      setOpen(false);
      return;
    }
    const next = new Set(selectedValues);
    if (next.has(option.value)) next.delete(option.value);
    else next.add(option.value);
    onChange([...next]);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
        className="flex-row items-center gap-3 min-h-12 px-3 py-2 rounded-md border border-subtle bg-surface-elevated"
      >
        {firstSelected ? <EntityThumbnail option={firstSelected} size={spacing[8]} /> : null}
        <Text
          tone={selected.length === 0 ? 'muted' : 'primary'}
          numberOfLines={1}
          className="flex-1"
        >
          {triggerLabel}
        </Text>
        <Ionicons
          name="chevron-down"
          size={iconSizes.sm}
          color={colors.light.fg.muted}
        />
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        closeLabel={t('common.close')}
        maxHeightRatio={0.8}
        testID="entity-choice-sheet"
        footer={
          mode === 'multi' ? (
            <View className="px-5 pt-3">
              <Button fullWidth variant="secondary" onPress={() => setOpen(false)}>
                {t('common.done')}
              </Button>
            </View>
          ) : null
        }
      >
            <FlatList
              data={options}
              keyExtractor={(option) => option.value}
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: spacing[2] }}
              renderItem={({ item }) => {
                const isSelected = selectedValues.includes(item.value);
                return (
                  <Pressable
                    onPress={() => select(item)}
                    disabled={item.disabled}
                    accessibilityRole={mode === 'multi' ? 'checkbox' : 'radio'}
                    accessibilityState={{ checked: isSelected, disabled: item.disabled }}
                    className={`flex-row items-center gap-3 px-4 py-3 border-b border-subtle ${item.disabled ? 'opacity-50' : ''}`}
                  >
                    <EntityThumbnail option={item} size={spacing[12]} />
                    <Text className="flex-1" numberOfLines={2}>{item.label}</Text>
                    {isSelected ? (
                      <Ionicons
                        name={mode === 'multi' ? 'checkbox' : 'checkmark-circle'}
                        size={iconSizes.lg}
                        color={colors.light.fg.accent}
                      />
                    ) : null}
                  </Pressable>
                );
              }}
            />
      </BottomSheet>
    </>
  );
}

function EntityThumbnail({ option, size }: { option: ChoiceOption; size: number }) {
  if (option.imageUri) {
    return (
      <RemoteImage
        testID={`entity-option-image-${option.value}`}
        uri={option.imageUri}
        variant="thumb"
        style={{ width: size, height: size, borderRadius: radii.md }}
        contentFit="cover"
        transitionMs={0}
      />
    );
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: radii.md }}
      className="items-center justify-center bg-secondary-subtle"
    >
      <Ionicons
        name="image-outline"
        size={iconSizes.md}
        color={colors.light.fg.primary}
      />
    </View>
  );
}
