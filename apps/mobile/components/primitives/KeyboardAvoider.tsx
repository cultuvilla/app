import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

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
 *
 * On Android it is switched off while the keyboard is down. RN reads Android's
 * `keyboardDidHide` like a show, and that event's `screenY` is the visible area's
 * height — the screen minus the status and navigation bars — so after closing
 * the keyboard the view kept those ~70dp as padding: a cream strip under every
 * form's footer (QA 2026-11-21). A disabled KeyboardAvoidingView pads nothing.
 */
export function KeyboardAvoider({ children, style, testID }: KeyboardAvoiderProps) {
  const wrapperRef = useRef<View>(null);
  const [windowY, setWindowY] = useState(0);
  const keyboardShown = useAndroidKeyboardShown();
  return (
    <View
      ref={wrapperRef}
      style={[{ flex: 1 }, style]}
      testID={testID}
      onLayout={() => wrapperRef.current?.measureInWindow((_x, y) => setWindowY(y))}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={windowY}
        enabled={keyboardShown}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

/** Whether the Android keyboard is up; always true on iOS, whose hide event is read right. */
function useAndroidKeyboardShown(): boolean {
  const android = Platform.OS === 'android';
  const [shown, setShown] = useState(() => !android || Keyboard.isVisible());
  useEffect(() => {
    if (!android) return;
    const subs = [
      Keyboard.addListener('keyboardDidShow', () => setShown(true)),
      Keyboard.addListener('keyboardDidHide', () => setShown(false)),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [android]);
  return shown;
}
