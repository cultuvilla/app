import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes, spacing } from '@cultuvilla/shared/design-system';
import { Text } from '../primitives';
import { useT } from '../../lib/i18n';
import { onCopied } from '../../lib/clipboard';

// Clears a default tab bar, like the offline pill.
const TAB_BAR_CLEARANCE = 64;
export const COPIED_TOAST_MS = 1500;

/** The short "Copiado" pill after `copyText`; mounted once at the app root. */
export function CopiedToast() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onCopied(() => {
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), COPIED_TOAST_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      testID="copied-toast"
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
        <Ionicons name="checkmark" size={iconSizes.sm} color={colors.light.fg['on-secondary']} />
        <Text variant="caption" style={{ color: colors.light.fg['on-secondary'] }}>
          {t('clipboard.copied')}
        </Text>
      </View>
    </View>
  );
}
