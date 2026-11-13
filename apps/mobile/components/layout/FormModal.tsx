import type { ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../primitives';
import { ScreenHeader } from './ScreenHeader';

/**
 * A full-screen form over the current screen — the orange header with a back
 * arrow, the fields, and the action pinned at the bottom — laid out like the
 * app's own form screens (editing a pueblo, creating an event). For a long form
 * opened from inside a screen, where a route would have to rebuild the
 * screen's state; a short pick stays a `BottomSheet`.
 */
export function FormModal({
  visible,
  onClose,
  title,
  footer,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Screen padded={false} topInset={false} bottomInset={false}>
        <View style={{ flex: 1 }} testID={testID}>
          <ScreenHeader accent title={title} onBack={onClose} />
          <View style={{ flex: 1 }}>{children}</View>
          {footer ? (
            <View className="bg-surface-elevated border-t border-subtle" style={{ paddingBottom: insets.bottom + 8 }}>
              {footer}
            </View>
          ) : null}
        </View>
      </Screen>
    </Modal>
  );
}
