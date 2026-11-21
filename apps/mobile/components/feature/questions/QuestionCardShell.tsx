import type { ReactNode } from 'react';
import { colors } from '@cultuvilla/shared/design-system';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, Toggle, VStack, HStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { ACCENT } from '../VillageSections';

/**
 * The card chrome every question builder shares: a numbered, tappable summary
 * when collapsed, and — when expanded — an accent-edged canvas card whose footer
 * carries the required toggle, the reorder arrows and the delete control.
 *
 * The builder-specific editor (label, type picker, options) is `children`, so
 * the census schema editor and the event sign-up editor look and behave the
 * same without sharing a field model.
 */
export function QuestionCardShell({
  index,
  title,
  subline,
  error,
  required,
  onRequiredChange,
  active,
  onActivate,
  onMove,
  onRemove,
  locked = false,
  testID,
  children,
}: {
  index: number;
  title: string;
  /** One-line type summary shown under the title when collapsed. */
  subline?: string;
  /** Already-translated error message; replaces the subline when set. */
  error?: string;
  required: boolean;
  onRequiredChange: (next: boolean) => void;
  active: boolean;
  onActivate: () => void;
  /** Omitted when the question can't be reordered (e.g. answers already keyed by order). */
  onMove?: (dir: -1 | 1) => void;
  /** Omitted when the question can't be deleted. */
  onRemove?: () => void;
  /** Shows the "in use" badge — the question already has collected answers. */
  locked?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const { t } = useT();

  if (!active) {
    return (
      <Pressable
        onPress={onActivate}
        testID={testID ? `${testID}-summary` : undefined}
        className="bg-surface-elevated border border-subtle rounded-xl p-4 shadow-sm"
      >
        <HStack gap={2} align="center">
          <Text tone="muted">{index + 1}.</Text>
          <View className="flex-1">
            <Text variant="body" numberOfLines={1}>{title}</Text>
            {error ? (
              <Text variant="bodySm" tone="danger" numberOfLines={1}>{error}</Text>
            ) : subline ? (
              <Text variant="bodySm" tone="muted" numberOfLines={1}>{subline}</Text>
            ) : null}
          </View>
          {required ? <Text style={{ color: ACCENT }}>*</Text> : null}
        </HStack>
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      className="bg-surface-elevated border border-subtle rounded-xl p-4 shadow-sm"
      style={{ borderLeftColor: ACCENT, borderLeftWidth: 4 }}
    >
      <VStack gap={3}>
        {children}

        {error ? <Text tone="danger">{error}</Text> : null}

        <View className="border-t border-subtle pt-3">
          <HStack gap={3} align="center" justify="between">
            <Toggle
              label={t('questions.required')}
              value={required}
              onValueChange={onRequiredChange}
              testID={testID ? `${testID}-required` : undefined}
            />
            <HStack gap={3} align="center">
              {onMove ? (
                <>
                  <Pressable
                    onPress={() => onMove(-1)}
                    accessibilityLabel={t('questions.moveUp')}
                    testID={testID ? `${testID}-up` : undefined}
                    className="p-1"
                  >
                    <Ionicons name="arrow-up" size={20} color={colors.light.fg.icon} />
                  </Pressable>
                  <Pressable
                    onPress={() => onMove(1)}
                    accessibilityLabel={t('questions.moveDown')}
                    testID={testID ? `${testID}-down` : undefined}
                    className="p-1"
                  >
                    <Ionicons name="arrow-down" size={20} color={colors.light.fg.icon} />
                  </Pressable>
                </>
              ) : null}
              {locked ? (
                <Text variant="bodySm" className="text-orange-600">{t('questions.locked')}</Text>
              ) : null}
              {onRemove ? (
                <Pressable
                  onPress={onRemove}
                  accessibilityLabel={t('common.delete')}
                  testID={testID ? `${testID}-remove` : undefined}
                  className="p-1"
                >
                  <Ionicons name="trash-outline" size={20} color={colors.light.fg.danger} />
                </Pressable>
              ) : null}
            </HStack>
          </HStack>
        </View>
      </VStack>
    </View>
  );
}
