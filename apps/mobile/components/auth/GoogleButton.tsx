import { Image, View } from 'react-native';
import { elevation } from '@cultuvilla/shared/design-system';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useT } from '../../lib/i18n';

const GOOGLE_G = require('../../assets/google-g.jpg');

export type GoogleButtonProps = {
  onPress: () => void;
  loading?: boolean;
  testID?: string;
};

export function GoogleButton({ onPress, loading = false, testID }: GoogleButtonProps) {
  const { t } = useT();
  const label = loading ? t('auth.googleConnecting') : t('auth.signInWithGoogle');
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={t('auth.signInWithGoogle')}
      testID={testID}
      className="bg-surface-elevated border-2 border-accent rounded-md h-14 px-4 justify-center"
      style={{
        shadowColor: elevation.md.rn.shadowColor,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 5,
      }}
    >
      <View className="flex-row items-center justify-center">
        <Image
          source={GOOGLE_G}
          style={{ width: 24, height: 24, marginRight: 12, resizeMode: 'contain' }}
        />
        <Text className="font-semibold">{label}</Text>
      </View>
    </Pressable>
  );
}
