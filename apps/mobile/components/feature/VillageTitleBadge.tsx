import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { ambassadorTitleKey, type VillageTitle } from '@cultuvilla/shared/models/municipality';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';
import { HStack, Text } from '../primitives';
import { useT } from '../../lib/i18n';

export interface VillageTitleBadgeProps {
  title: VillageTitle;
  /** The Embajador's `community.organizerSex` — picks Embajador/Embajadora. */
  sex?: Sex | null;
  testID?: string;
}

/**
 * The public face of a village role. The Embajador gets an accent pill with a
 * ribbon — the title is meant to be worn — while the team gets a quiet one.
 * Plain members render nothing: being a vecino needs no badge.
 */
export function VillageTitleBadge({ title, sex = null, testID }: VillageTitleBadgeProps) {
  const { t } = useT();
  if (title === 'member') return null;

  if (title === 'team') {
    return (
      <View testID={testID} className="self-start rounded-full border border-subtle px-2 py-0.5">
        <Text variant="caption" tone="muted">
          {t('ambassador.team')}
        </Text>
      </View>
    );
  }

  const label = t(ambassadorTitleKey(sex));
  return (
    <HStack
      testID={testID}
      gap={1}
      className="self-start items-center rounded-full bg-accent px-2.5 py-1"
    >
      <Ionicons name="ribbon" size={iconSizes.sm} color={colors.light.fg['on-accent']} />
      <Text variant="caption" tone="onAccent" className="font-semibold">
        {label}
      </Text>
    </HStack>
  );
}
