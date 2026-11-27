import { useEffect } from 'react';
import { BackHandler, Modal, Platform, StyleSheet, View } from 'react-native';
import { Button, Text, VStack } from './primitives';

export interface AppUpdateModalProps {
  visible: boolean;
  title: string;
  body: string;
  /** Label of the primary action; opens the store. */
  ctaLabel: string;
  onUpdate: () => void;
  /**
   * Dismiss handler for the soft prompt. Omit for the hard block — the absence
   * of this prop is what makes the modal non-dismissible.
   */
  onDismiss?: () => void;
  dismissLabel?: string;
}

/**
 * Update prompt. Two shapes, one component:
 *
 * - **hard block** (no `onDismiss`): no secondary action, `onRequestClose` is a
 *   no-op and Android's hardware back is swallowed, so the only way forward is
 *   the store. The running binary is below `minSupported` and must not be used,
 *   so `AppVersionGate` renders it *instead of* the app tree, never over it.
 * - **soft prompt** (`onDismiss` given): "later" + "update", over the running app.
 *
 * Never rendered on web — `resolveVersionGate` returns 'ok' there, since the
 * web build updates itself on reload and has no store to send anyone to.
 *
 * Web-compat: the backdrop is absolutely positioned rather than `flex-1`
 * (RN-Web's <Modal> doesn't flex-fill its child) and there is no Animated —
 * same constraints as BlockingOverlay, see the mobile-web-compat skill.
 */
export function AppUpdateModal({
  visible,
  title,
  body,
  ctaLabel,
  onUpdate,
  onDismiss,
  dismissLabel,
}: AppUpdateModalProps) {
  const blocking = !onDismiss;

  useEffect(() => {
    if (!visible || !blocking || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible, blocking]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onDismiss?.()}
    >
      <View style={styles.backdrop}>
        <View className="w-full max-w-sm rounded-lg bg-surface p-6" testID="app-update-modal">
          <VStack gap={3}>
            <Text variant="h2" className="text-center">
              {title}
            </Text>
            <Text tone="muted" className="text-center">
              {body}
            </Text>
            <Button onPress={onUpdate} fullWidth testID="app-update-cta">
              {ctaLabel}
            </Button>
            {onDismiss && dismissLabel ? (
              <Button variant="ghost" onPress={onDismiss} fullWidth testID="app-update-dismiss">
                {dismissLabel}
              </Button>
            ) : null}
          </VStack>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
});
