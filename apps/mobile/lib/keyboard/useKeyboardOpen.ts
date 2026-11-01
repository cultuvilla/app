import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
}

/**
 * On edge-to-edge Android, Screen's keyboard padding comes up short by the status
 * bar plus the navigation bar (measured: IME top 1944 px, keyboard event's `screenY`
 * 2172 px, bars 144 + 84). A form hides that by scrolling its field in, but a
 * composer at the very bottom would stay behind the keyboard.
 */
export function useComposerKeyboardGap(): number {
  const insets = useSafeAreaInsets();
  const open = useKeyboardOpen();
  return open && Platform.OS === 'android' ? insets.top + insets.bottom : 0;
}
