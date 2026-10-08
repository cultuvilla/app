import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, spacing } from '@cultuvilla/shared/design-system';
import { Avatar, BottomSheet, Button, HStack, Input, Pressable, Text, VStack } from '../primitives';
import { filterOptions, orderOptions, type PickerOption } from './pickerOptions';
import { useT } from '../../lib/i18n';

const ACCENT = colors.light.fg.accent;

export interface SelectableRow extends PickerOption {
  imageUri?: string | null;
  /** Cannot be toggled (e.g. the event creator, who is always an organizer). */
  disabled?: boolean;
  /** Caption shown instead of the checkmark (e.g. "Organizador"). */
  trailing?: string;
}

export interface SearchableSelectSheetProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  /** Shown in place of the list when there is nothing at all to pick. */
  emptyLabel: string | null;
  rows: SelectableRow[];
  /** Live selection — the sheet is controlled by its parent. */
  selected: Set<string>;
  /**
   * Selection as it stood when the sheet opened; these rows are pinned to the
   * top. Kept separate from `selected` so a row does not jump under the finger
   * that just ticked it.
   */
  pinned: Set<string>;
  onToggle: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  confirmTestID: string;
  rowTestIDPrefix: string;
}

function initialsOf(name: string): string | undefined {
  return name ? name.slice(0, 1).toUpperCase() : undefined;
}

/**
 * Multi-select bottom sheet with a search box — the picker for villagers and
 * for village groups.
 *
 * The search box is always visible rather than appearing past some row count:
 * one behaviour to learn, and the lists it fronts are already large (165
 * members in Matabuena on the day this was written).
 */
export function SearchableSelectSheet({
  open,
  title,
  confirmLabel,
  emptyLabel,
  rows,
  selected,
  pinned,
  onToggle,
  onClose,
  onConfirm,
  confirmTestID,
  rowTestIDPrefix,
}: SearchableSelectSheetProps) {
  const { t } = useT();
  const [search, setSearch] = useState('');

  const visible = useMemo(
    () => filterOptions(orderOptions(rows, pinned), search),
    [rows, pinned, search],
  );

  function close() {
    setSearch('');
    onClose();
  }

  function confirm() {
    setSearch('');
    onConfirm();
  }

  return (
    <BottomSheet
      visible={open}
      onClose={close}
      title={title}
      closeLabel={t('common.close')}
      testID={`${rowTestIDPrefix}-sheet`}
      footer={
        <VStack gap={2} className="px-5 pt-3">
          <Button onPress={confirm} fullWidth testID={confirmTestID}>
            {confirmLabel}
          </Button>
        </VStack>
      }
    >
      {/* flexShrink here too: the list's ScrollView can only shrink if its
          wrapper does. Without it a long list grows the body past the sheet's
          maxHeight and pushes the confirm footer off-screen. */}
      <View
        className="px-5 pt-2"
        style={{ flexShrink: 1, gap: spacing[3] }}
        testID={`${rowTestIDPrefix}-body`}
      >
        {emptyLabel ? null : (
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder={t('common.search')}
            accessibilityLabel={t('common.search')}
            testID={`${rowTestIDPrefix}-search`}
            autoCorrect={false}
            autoCapitalize="none"
            dense
            rightAdornment={
              search ? (
                <Pressable
                  onPress={() => setSearch('')}
                  accessibilityLabel={t('common.close')}
                  testID={`${rowTestIDPrefix}-search-clear`}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle" size={iconSizes.md} color="#94a3b8" />
                </Pressable>
              ) : (
                <Ionicons name="search" size={iconSizes.md} color="#94a3b8" />
              )
            }
          />
        )}
        {/* flexShrink, not a fixed maxHeight: the sheet itself caps the height,
            so the list takes whatever room is left and no more. */}
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          <VStack gap={2}>
            {emptyLabel ? (
              <Text tone="muted">{emptyLabel}</Text>
            ) : visible.length === 0 ? (
              <Text tone="muted" testID={`${rowTestIDPrefix}-no-results`}>
                {t('common.noResults')}
              </Text>
            ) : (
              visible.map((row) => (
                <SheetRow
                  key={row.id}
                  testID={`${rowTestIDPrefix}-${row.id}`}
                  label={row.label}
                  imageUri={row.imageUri}
                  selected={selected.has(row.id)}
                  disabled={row.disabled}
                  trailing={row.trailing}
                  onPress={() => onToggle(row.id)}
                />
              ))
            )}
          </VStack>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

function SheetRow({
  label,
  selected,
  disabled,
  trailing,
  imageUri,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  trailing?: string;
  imageUri?: string | null;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      disabled={disabled}
      className={[
        'flex-row items-center justify-between rounded-lg border p-3',
        selected ? 'border-accent bg-surface' : 'border-subtle',
        disabled ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <HStack gap={2} align="center" className="flex-1">
        <Avatar uri={imageUri ?? null} size={32} initials={initialsOf(label)} />
        <Text className="flex-1" numberOfLines={1}>
          {label}
        </Text>
      </HStack>
      {trailing ? (
        <Text variant="caption" tone="muted">
          {trailing}
        </Text>
      ) : selected ? (
        <Ionicons name="checkmark" size={iconSizes.md} color={ACCENT} />
      ) : null}
    </Pressable>
  );
}
