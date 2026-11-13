import { View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import type { CuotaStatus } from '@cultuvilla/shared/models/organization';
import { Pressable, Text } from '../../primitives';
import { CUOTA_STATUS_TONE } from '../../../lib/orgs/cuota';
import { useT } from '../../../lib/i18n';

/** The same banner shape as the village's fiestas button. */
const BUTTON_ASPECT = 3;

// Drawn once and bundled, like the fiestas button: it costs no download.
const ILLUSTRATION = require('../../../assets/groups/cuota-button.svg') as number;

/** The member's cuota, closing the group's home: a banner button with their status on it. */
export function CuotaBanner({ label, status, onPress }: { label: string; status: CuotaStatus; onPress: () => void }) {
  const { t } = useT();
  const statusLabel = t(`groups.cuota.status.${status}`);

  return (
    <View className="px-4 pt-8">
      <Pressable testID="group-home-cuota" onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${statusLabel}`}>
        <View className="overflow-hidden bg-accent" style={{ width: '100%', aspectRatio: BUTTON_ASPECT, borderRadius: 16 }}>
          <Image
            source={ILLUSTRATION}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            contentFit="cover"
            accessible={false}
          />
          <View className="flex-1 flex-row items-end gap-2 px-4 pb-3">
            <View className="items-start gap-1">
              <View className="bg-surface rounded-full px-2 py-0.5">
                <Text variant="caption" tone={CUOTA_STATUS_TONE[status]} className="font-bold">
                  {statusLabel}
                </Text>
              </View>
              <Text variant="h2" className="font-bold" style={{ color: colors.light.fg['on-accent'] }}>
                {label}
              </Text>
            </View>
            <View className="pb-0.5">
              <Ionicons name="chevron-forward" size={iconSizes.md} color={colors.light.fg['on-accent']} />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
