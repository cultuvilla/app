import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, View, type StyleProp, type ViewStyle } from 'react-native';

export type KeyboardAvoiderProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shrinks its children by however much of it the on-screen keyboard covers, so
 * a focused field inside a ScrollView can be scrolled (Android scrolls it in by
 * itself) instead of hiding behind the keyboard.
 *
 * Both platforms use `padding`. Android is edge-to-edge since Expo SDK 54 — the
 * activity and every `Modal` window — so the window no longer resizes for the
 * keyboard, and the old `behavior={ios ? 'padding' : undefined}` left Android
 * fields covered.
 *
 * RN's KeyboardAvoidingView compares the keyboard's *screen* position with its
 * own frame *relative to its parent*, so it under-pads by however far down the
 * screen that parent starts. Measuring the wrapper in window coordinates and
 * feeding that back as `keyboardVerticalOffset` makes it right wherever it sits.
 */
export function KeyboardAvoider({ children, style, testID }: KeyboardAvoiderProps) {
  const wrapperRef = useRef<View>(null);
  const [windowY, setWindowY] = useState(0);
  return (
    <View
      ref={wrapperRef}
      style={[{ flex: 1 }, style]}
      testID={testID}
      onLayout={() => wrapperRef.current?.measureInWindow((_x, y) => setWindowY(y))}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={windowY}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}
