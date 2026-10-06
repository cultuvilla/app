import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '@cultuvilla/shared/design-system';
import { RemoteImage } from './RemoteImage';
import { Pressable } from './Pressable';
import { Text } from './Text';

const CULTUVILLA_MARK = require('../../assets/logo.png');

export interface AvatarProps {
  uri?: string | null;
  size?: number;
  initials?: string;
  onPress?: () => void;
  /** Stamps the Cultuvilla seal on the corner: the face of a pueblo's Embajador. */
  ambassador?: boolean;
}

export function Avatar({ uri, size = 96, initials, onPress, ambassador = false }: AvatarProps) {
  const radius = size / 2;
  const face = uri ? (
    // `thumb`: an avatar is at most ~96dp, so the 240px rendition is already
    // generous at 3x DPR and a fraction of the original's weight.
    <RemoteImage
      uri={uri}
      variant="thumb"
      style={{ width: size, height: size, borderRadius: radius }}
      contentFit="cover"
      transitionMs={0}
      testID="avatar-image"
    />
  ) : (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text variant="h2" tone="muted">{initials ?? '+'}</Text>
    </View>
  );

  const content = ambassador ? (
    <View style={{ width: size, height: size }}>
      {face}
      <AmbassadorSeal avatarSize={size} />
    </View>
  ) : (
    face
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

function AmbassadorSeal({ avatarSize }: { avatarSize: number }) {
  // Below ~16dp the mark stops reading as the logo, so tiny avatars get a
  // floor rather than a proportional speck.
  const seal = Math.max(16, Math.round(avatarSize * 0.38));
  const border = seal >= 28 ? 2 : 1.5;
  return (
    <View
      testID="avatar-ambassador-seal"
      style={[
        styles.seal,
        {
          width: seal,
          height: seal,
          borderRadius: seal / 2,
          borderWidth: border,
          right: -seal * 0.12,
          bottom: -seal * 0.08,
        },
      ]}
    >
      <Image
        source={CULTUVILLA_MARK}
        style={{ width: seal - border * 2 - 2, height: seal - border * 2 - 2 }}
        contentFit="contain"
        testID="avatar-ambassador-mark"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seal: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.bg['surface-elevated'],
    borderColor: colors.light.bg.accent,
  },
});
