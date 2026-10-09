import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from '../primitives/Pressable';
import { HeaderIconButton } from './HeaderIconButton';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { useT } from '../../lib/i18n';

export type EntityDetailAction = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  /** `<kind>-edit-action` / `<kind>-share-action`, so a flow can reach it. */
  testID: string;
};

/**
 * Solid static top bar for entity detail screens: back on the left, an optional
 * list of action icons on the right. Sits at the very top of the screen over
 * the surface background (the flyer starts just below it), so it claims the
 * top safe-area inset itself and drives a dark status bar. Replaces the
 * translucent Floating* discs that used to sit over the hero image.
 */
export function EntityDetailHeader({
  onBack,
  actions = [],
}: {
  onBack?: () => void;
  actions?: EntityDetailAction[];
}) {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const handleBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')));
  return (
    <View className="bg-surface border-b border-subtle" style={{ paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <View className="h-14 flex-row items-center justify-between px-3">
        <Pressable onPress={handleBack} accessibilityLabel={t('header.back')} className="p-2 -ml-2">
          <Ionicons name="chevron-back" size={iconSizes.lg} color={colors.light.fg.accent} />
        </Pressable>
        <View className="flex-row items-center">
          {actions.map((a) => (
            <HeaderIconButton
              key={a.accessibilityLabel}
              icon={a.icon}
              onPress={a.onPress}
              accessibilityLabel={a.accessibilityLabel}
              testID={a.testID}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
