import { View } from 'react-native';
import { Avatar, HStack, ScreenTitle, Text, VStack } from '../../primitives';
import { buildDisplayName, buildShortName } from '@cultuvilla/shared/models/person';
import type { PersonData } from '@cultuvilla/shared/models/person';
import { ambassadorTitleKey } from '@cultuvilla/shared/models/municipality';
import { colors } from '@cultuvilla/shared/design-system';
import type { AmbassadorVillage } from '../../../lib/hooks/useAmbassadorVillages';
import { useT } from '../../../lib/i18n';

export interface ProfileHeaderProps {
  person: (PersonData & { id: string }) | null;
  fallbackName: string;
  /** Active village name, shown under the name (mirrors the village tab's province line). */
  subtitle?: string | null;
  uploading?: boolean;
  onPressAvatar?: () => void;
  /** Pueblos whose Embajador title this person holds: each gets a line under
   *  the name, and any at all stamps the Cultuvilla seal on the photo. */
  ambassadorOf?: AmbassadorVillage[];
}

export function ProfileHeader({
  person,
  fallbackName,
  subtitle,
  uploading,
  onPressAvatar,
  ambassadorOf = [],
}: ProfileHeaderProps) {
  const { t } = useT();
  const displayName = person ? buildDisplayName(person) : fallbackName;
  const shortName = person ? buildShortName(person) : fallbackName;
  const initials = (shortName || fallbackName || '?').charAt(0).toUpperCase();

  return (
    <HStack gap={4} align="center" className="px-4 pt-4">
      <View>
        <Avatar
          uri={person?.photoURL ?? undefined}
          size={88}
          initials={initials}
          onPress={onPressAvatar}
          ambassador={ambassadorOf.length > 0}
        />
        {uploading ? (
          <View className="absolute inset-0 items-center justify-center bg-surface/60 rounded-full">
            <Text variant="caption" tone="muted">…</Text>
          </View>
        ) : null}
      </View>
      <VStack gap={0} className="flex-1">
        <ScreenTitle style={{ fontSize: 27, lineHeight: 33 }}>{displayName}</ScreenTitle>
        {subtitle ? (
          <Text tone="muted" variant="bodySm" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {ambassadorOf.map((v) => (
          <View
            key={v.id}
            testID={`ambassador-badge-${v.id}`}
            className="mt-1.5 self-start rounded-full bg-subtle px-2.5 py-0.5"
          >
            <Text variant="caption" className="font-semibold" style={{ color: colors.light.fg.accent }}>
              {t(ambassadorTitleKey(v.sex, 'inVillage'), { village: v.name })}
            </Text>
          </View>
        ))}
      </VStack>
    </HStack>
  );
}
