import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, spacing } from '@cultuvilla/shared/design-system';
import { Text } from '../primitives';
import { useT } from '../../lib/i18n';

// Clears a default tab bar, so the pill never sits on top of a tab.
const TAB_BAR_CLEARANCE = 64;

/**
 * Offline only when NetInfo says so for certain. `isInternetReachable` is
 * `null` until its first probe, and a not-yet-known state must not flash the
 * banner on every launch.
 */
export function isOffline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

/**
 * The quiet offline notice (docs/plans/ongoing/offline-first-village.md):
 * screens keep rendering from the on-device cache, so this informs and never
 * blocks — it takes no touches.
 */
export function OfflineBanner() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => NetInfo.addEventListener((state) => setOffline(isOffline(state))), []);

  if (!offline) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      testID="offline-banner"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + TAB_BAR_CLEARANCE,
        alignItems: 'center',
      }}
    >
      <View
        className="flex-row items-center rounded-full bg-secondary"
        style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[1], gap: spacing[2] }}
      >
        <Ionicons name="cloud-offline-outline" size={iconSizes.sm} color={colors.light.fg['on-secondary']} />
        <Text variant="caption" style={{ color: colors.light.fg['on-secondary'] }}>
          {t('common.offline')}
        </Text>
      </View>
    </View>
  );
}
