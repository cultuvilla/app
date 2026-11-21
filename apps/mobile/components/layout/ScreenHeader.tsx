import { View } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useT } from '../../lib/i18n';

export type ScreenHeaderProps = {
  title?: string;
  /** Custom back handler (defaults to router.back). */
  onBack?: () => void;
  /** Hide the back button entirely. */
  hideBack?: boolean;
  /** Optional content rendered on the right (icon buttons, etc.). */
  rightSlot?: ReactNode;
  /** Override the title color (defaults to theme primary). */
  titleColor?: string;
  /**
   * Branded variant matching the main AppHeader: full-width accent (orange)
   * bar with a white title, safe-area top padding and a light status bar.
   * Drops the menu/notification icons — back button + title only.
   */
  accent?: boolean;
};

export function ScreenHeader({
  title,
  onBack,
  hideBack = false,
  rightSlot,
  titleColor,
  accent = false,
}: ScreenHeaderProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => router.back());

  // Branded orange bar — same width/color as the main app header (AppHeader),
  // without the menu/notification icons.
  if (accent) {
    return (
      <>
        <StatusBar style="light" />
        <View className="bg-accent" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center px-3 pt-1 pb-3">
            <View className="w-10 items-start">
              {!hideBack ? (
                <Pressable
                  onPress={handleBack}
                  accessibilityLabel={t('header.back')}
                  className="p-1 -ml-1"
                >
                  <Ionicons name="chevron-back" size={26} color={colors.light.fg['on-accent']} />
                </Pressable>
              ) : null}
            </View>
            <View className="flex-1 items-center">
              {title ? (
                <Text
                  variant="h3"
                  tone="onAccent"
                  numberOfLines={1}
                  style={{ fontFamily: 'Fraunces_700Bold', letterSpacing: 0.3 }}
                >
                  {title}
                </Text>
              ) : null}
            </View>
            <View className="w-10 items-end flex-row justify-end">{rightSlot}</View>
          </View>
        </View>
      </>
    );
  }

  return (
    <View className="bg-surface border-b border-subtle">
      <View className="h-11 flex-row items-center px-4">
        <View className="w-10 items-start">
          {!hideBack ? (
            <Pressable
              onPress={handleBack}
              accessibilityLabel={t('header.back')}
              className="p-1 -ml-1"
            >
              <Ionicons name="chevron-back" size={24} color="#0f172a" />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-1 items-center">
          {title ? (
            <Text variant="h3" numberOfLines={1} style={titleColor ? { color: titleColor } : undefined}>
              {title}
            </Text>
          ) : null}
        </View>
        <View className="w-10 items-end flex-row justify-end">{rightSlot}</View>
      </View>
    </View>
  );
}
