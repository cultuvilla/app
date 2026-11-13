import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import {
  currentPeriodKey,
  MAX_CUOTA_YEAR_AMOUNTS,
  parseEuroCents,
  type CuotaYearAmount,
} from '@cultuvilla/shared/models/organization';
import { Button, HStack, Input, Pressable, Text, Toggle, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { centsInputValue } from '../../../lib/orgs/cuota';

export interface YearDraft {
  year: string;
  amount: string;
}

export function yearDraftsOf(amounts: CuotaYearAmount[]): YearDraft[] {
  return amounts.map((y) => ({ year: y.year, amount: centsInputValue(y.amountCents) }));
}

/** The rows as stored, or null when a year is malformed or repeated, or an amount is missing. */
export function parseYearDrafts(rows: YearDraft[]): CuotaYearAmount[] | null {
  const parsed: CuotaYearAmount[] = [];
  for (const row of rows) {
    const year = row.year.trim();
    const amountCents = parseEuroCents(row.amount);
    if (!/^\d{4}$/.test(year) || amountCents === null || parsed.some((y) => y.year === year)) return null;
    parsed.push({ year, amountCents });
  }
  return parsed;
}

/** A price's switch to depend on the calendar year, and each year's amount once it does. */
export function CuotaYearAmountsField({
  testID,
  rows,
  error,
  onChange,
}: {
  testID: string;
  rows: YearDraft[];
  error?: string;
  onChange: (rows: YearDraft[]) => void;
}) {
  const { t } = useT();
  const nextYear = () => {
    const years = rows.map((row) => Number(row.year)).filter((year) => Number.isInteger(year) && year > 0);
    return years.length > 0 ? String(Math.max(...years) + 1) : currentPeriodKey('yearly');
  };

  return (
    <VStack gap={2} testID={testID}>
      <Toggle
        testID={`${testID}-toggle`}
        value={rows.length > 0}
        label={t('groups.cuota.settings.byYear')}
        onValueChange={(on) => onChange(on ? [{ year: nextYear(), amount: '' }] : [])}
      />
      {rows.length > 0 ? (
        <Text variant="bodySm" tone="muted">
          {t('groups.cuota.settings.byYearHint')}
        </Text>
      ) : null}
      {rows.map((row, index) => (
        <HStack key={index} gap={2} align="center">
          <View className="flex-1">
            <Input
              label={t('groups.cuota.settings.year')}
              value={row.year}
              keyboardType="number-pad"
              maxLength={4}
              onChangeText={(year) => onChange(rows.map((r, i) => (i === index ? { ...r, year } : r)))}
              testID={`${testID}-year-${String(index)}`}
            />
          </View>
          <View className="flex-1">
            <Input
              label={t('groups.cuota.settings.amount')}
              value={row.amount}
              keyboardType="decimal-pad"
              onChangeText={(amount) => onChange(rows.map((r, i) => (i === index ? { ...r, amount } : r)))}
              testID={`${testID}-amount-${String(index)}`}
            />
          </View>
          <Pressable
            testID={`${testID}-remove-${String(index)}`}
            accessibilityRole="button"
            accessibilityLabel={t('groups.cuota.settings.removeYear', { year: row.year })}
            onPress={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Ionicons name="close" size={iconSizes.md} color={colors.light.fg.muted} />
          </Pressable>
        </HStack>
      ))}
      {error ? (
        <Text variant="bodySm" tone="danger">
          {error}
        </Text>
      ) : null}
      {rows.length > 0 && rows.length < MAX_CUOTA_YEAR_AMOUNTS ? (
        <HStack>
          <Button variant="secondary" testID={`${testID}-add`} onPress={() => onChange([...rows, { year: nextYear(), amount: '' }])}>
            {t('groups.cuota.settings.addYear')}
          </Button>
        </HStack>
      ) : null}
    </VStack>
  );
}
