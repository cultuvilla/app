import { View } from 'react-native';
import { Avatar, HStack, ScreenTitle, Text, VStack } from '../../primitives';
import { buildDisplayName, buildShortName } from '@cultuvilla/shared/models/person';
import type { PersonData } from '@cultuvilla/shared/models/person';

export interface ProfileHeaderProps {
  person: (PersonData & { id: string }) | null;
  fallbackName: string;
  /** Active village name, shown under the name (mirrors the village tab's province line). */
  subtitle?: string | null;
  uploading?: boolean;
  onPressAvatar?: () => void;
  /** Holds a pueblo's Embajador title — stamps the Cultuvilla seal on the photo. */
  ambassador?: boolean;
}

export function ProfileHeader({
  person,
  fallbackName,
  subtitle,
  uploading,
  onPressAvatar,
  ambassador = false,
}: ProfileHeaderProps) {
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
          ambassador={ambassador}
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
      </VStack>
    </HStack>
  );
}
