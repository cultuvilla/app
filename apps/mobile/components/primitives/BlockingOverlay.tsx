import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';
import { Text } from './Text';
import { VStack } from './VStack';

export interface BlockingOverlayProps {
  /** When true, the overlay covers the screen and blocks interaction. */
  visible: boolean;
  /** Localized wait message, e.g. "Eliminando evento…". */
  label: string;
}

/**
 * Non-dismissible full-screen busy overlay for irreversible async actions
 * (delete). Dims the whole screen behind a spinner + label so the user knows a
 * write is in flight and to wait — not to tap again or leave.
 *
 * Web-compat: RN-Web's <Modal> doesn't flex-fill its child, so the backdrop is
 * explicitly absolute-positioned rather than `flex-1` (see the
 * mobile-web-compat skill). No Animated here on purpose — NativeWind drops
 * className on Animated.* on web.
 */
export function BlockingOverlay({ visible, label }: BlockingOverlayProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <VStack gap={3} className="items-center">
          <ActivityIndicator size="large" color={colors.light.fg['on-accent']} />
          <Text tone="onAccent">{label}</Text>
        </VStack>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Explicit full-bleed positioning (not `flex-1`): RN-Web's <Modal> doesn't
  // flex-fill its child. See the mobile-web-compat skill.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});
