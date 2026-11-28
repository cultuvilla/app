import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { TEXT_SCALING } from '../../lib/text/textScaling';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { VStack } from '../primitives/VStack';
import { HStack } from '../primitives/HStack';
import { FieldLabel } from '../primitives/FieldLabel';
import { PHONE_COUNTRIES, flagEmoji, type PhoneCountry } from '@cultuvilla/shared/utils';

export interface PhoneFieldProps {
  label?: string;
  placeholder?: string;
  /** Placeholder for the country search box shown when the picker is open. */
  searchPlaceholder?: string;
  /** Shown inside the picker when a search matches no country. */
  noResultsLabel?: string;
  /** The national part of the number (everything after the dial code). */
  value: string;
  onChangeText: (next: string) => void;
  /** Selected country / dial code. Default should be `DEFAULT_PHONE_COUNTRY`. */
  country: PhoneCountry;
  onCountryChange: (next: PhoneCountry) => void;
  error?: string;
  testID?: string;
}

// Fold accents and case so "peru" matches "Perú" and "espana" matches "España".
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Phone input with a country-prefix selector. The prefix drives validation
 * (see `isValidPhoneNumber`), so it's a first-class control rather than free
 * text. The country list expands inline instead of in a nested Modal — nested
 * Modals misbehave on the RN-Web build (see the `mobile-web-compat` skill) —
 * and is searchable + scrollable because the full worldwide list is long.
 */
export function PhoneField({
  label,
  placeholder,
  searchPlaceholder,
  noResultsLabel,
  value,
  onChangeText,
  country,
  onCountryChange,
  error,
  testID,
}: PhoneFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const borderClass = error ? 'border-danger' : 'border-subtle';

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return PHONE_COUNTRIES;
    const nq = normalize(q);
    return PHONE_COUNTRIES.filter(
      (c) => normalize(c.name).includes(nq) || c.dialCode.includes(q),
    );
  }, [query]);

  function togglePicker() {
    setPickerOpen((o) => !o);
    setQuery('');
  }

  function selectCountry(c: PhoneCountry) {
    onCountryChange(c);
    setPickerOpen(false);
    setQuery('');
  }

  return (
    <VStack gap={1}>
      {label && <FieldLabel>{label}</FieldLabel>}
      <HStack gap={2} className="items-center">
        <Pressable
          onPress={togglePicker}
          testID={testID ? `${testID}-prefix` : undefined}
          accessibilityRole="button"
          accessibilityState={{ expanded: pickerOpen }}
          className={`border rounded-md px-3 py-2 bg-surface ${borderClass}`}
        >
          <HStack gap={1} className="items-center">
            <Text>{flagEmoji(country.code)}</Text>
            <Text className="text-primary text-body">{country.dialCode}</Text>
            <Text tone="muted">▾</Text>
          </HStack>
        </Pressable>
        <View className={`flex-1 flex-row items-center border rounded-md px-3 py-2 bg-surface ${borderClass}`}>
          <TextInput {...TEXT_SCALING.body}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            keyboardType="phone-pad"
            accessibilityLabel={label ?? placeholder}
            className="flex-1 text-primary text-body"
            textAlignVertical="center"
            testID={testID}
          />
        </View>
      </HStack>

      {pickerOpen && (
        <VStack gap={1} className="border border-subtle rounded-md bg-surface p-1">
          <View className="flex-row items-center border border-subtle rounded-md px-3 py-2 bg-surface">
            <TextInput {...TEXT_SCALING.body}
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              accessibilityLabel={searchPlaceholder}
              autoCorrect={false}
              autoCapitalize="none"
              className="flex-1 text-primary text-body"
              textAlignVertical="center"
              testID={testID ? `${testID}-search` : undefined}
            />
          </View>

          <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
            <VStack gap={1}>
              {filtered.length === 0 && noResultsLabel ? (
                <Text tone="muted" className="px-3 py-2">
                  {noResultsLabel}
                </Text>
              ) : (
                filtered.map((c) => (
                  <Pressable
                    key={c.code}
                    onPress={() => selectCountry(c)}
                    testID={testID ? `${testID}-option-${c.code}` : undefined}
                    accessibilityRole="button"
                    accessibilityState={{ selected: c.code === country.code }}
                    className={`rounded-md px-3 py-2 ${c.code === country.code ? 'bg-surface-elevated' : ''}`}
                  >
                    <HStack gap={2} className="items-center">
                      <Text>{flagEmoji(c.code)}</Text>
                      <Text className="flex-1 text-primary">{c.name}</Text>
                      <Text tone="muted">{c.dialCode}</Text>
                    </HStack>
                  </Pressable>
                ))
              )}
            </VStack>
          </ScrollView>
        </VStack>
      )}

      {error && (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      )}
    </VStack>
  );
}
