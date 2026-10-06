import { View } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import type { Sex } from '@cultuvilla/shared/models/core/SexModel';
import { Avatar, Escudo, HStack, Text, VStack } from '../primitives';
import { useT } from '../../lib/i18n';

export interface AmbassadorCarnetProps {
  name: string;
  photoURL: string | null;
  sex: Sex | null;
  villageName: string;
  escudoUrl: string | null;
  testID?: string;
}

/**
 * The Embajador's carnet: a face, a name and the title for one pueblo, stamped
 * with the Cultuvilla seal. Purely presentational, so the request screen can
 * show an applicant exactly how the title will read on them before they ask.
 */
export function AmbassadorCarnet({
  name,
  photoURL,
  sex,
  villageName,
  escudoUrl,
  testID,
}: AmbassadorCarnetProps) {
  const { t } = useT();
  const initials = (name.trim().charAt(0) || '?').toUpperCase();
  const titleKey = sex === 'female' ? 'organize.carnet.titleFemale' : 'organize.carnet.title';

  return (
    <View testID={testID} className="overflow-hidden rounded-lg border border-accent bg-surface-elevated">
      <View className="bg-accent px-4 py-2">
        <Text
          variant="caption"
          tone="onAccent"
          className="font-semibold uppercase"
          style={{ letterSpacing: 0.8 }}
        >
          {t('organize.carnet.header')}
        </Text>
      </View>
      <HStack gap={4} className="items-center p-4">
        <Avatar uri={photoURL} size={72} initials={initials} ambassador />
        <VStack gap={1} className="flex-1">
          <Text className="font-semibold" numberOfLines={2} testID="ambassador-carnet-name">
            {name}
          </Text>
          <Text
            variant="bodySm"
            className="font-semibold"
            style={{ color: colors.light.fg.accent }}
            testID="ambassador-carnet-title"
          >
            {t(titleKey, { village: villageName })}
          </Text>
        </VStack>
        <Escudo url={escudoUrl} size={64} fallbackInitial={villageName} />
      </HStack>
    </View>
  );
}
