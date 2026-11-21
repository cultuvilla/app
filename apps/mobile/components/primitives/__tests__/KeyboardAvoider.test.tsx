import { act, fireEvent, render } from '@testing-library/react-native';
import { Keyboard, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { KeyboardAvoider } from '../KeyboardAvoider';

// Android is edge-to-edge (Expo SDK 54+): the window never resizes for the
// keyboard, so `behavior` must be set on both platforms or Android fields end
// up under the keyboard.
describe('<KeyboardAvoider>', () => {
  it('pads on every platform', () => {
    const { UNSAFE_getByType } = render(
      <KeyboardAvoider>
        <Text>x</Text>
      </KeyboardAvoider>,
    );
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  // KeyboardAvoidingView compares the keyboard's screen position with its frame
  // relative to its parent; the offset is how far down the window that parent starts.
  it('offsets by its own position in the window', () => {
    const measureInWindow = jest
      .spyOn(View.prototype as unknown as { measureInWindow: (cb: (x: number, y: number) => void) => void }, 'measureInWindow')
      .mockImplementation((cb) => cb(0, 88));
    const { UNSAFE_getByType, getByTestId } = render(
      <KeyboardAvoider testID="avoider">
        <Text>x</Text>
      </KeyboardAvoider>,
    );
    act(() => {
      fireEvent(getByTestId('avoider'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 1, height: 1 } } });
    });
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.keyboardVerticalOffset).toBe(88);
    measureInWindow.mockRestore();
  });

  // QA 2026-11-21: RN computes Android's keyboardDidHide like a show, from the
  // visible area's height, which leaves the bars' height as padding after the
  // keyboard closes. So on Android the view only pads while the keyboard is up.
  describe('on Android', () => {
    const os = Platform.OS;
    const listeners = new Map<string, () => void>();
    beforeEach(() => {
      Platform.OS = 'android';
      jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
      jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
        listeners.set(event, cb);
        return { remove: () => listeners.delete(event) };
      }) as unknown as typeof Keyboard.addListener);
    });
    afterEach(() => {
      Platform.OS = os;
      jest.restoreAllMocks();
      listeners.clear();
    });

    it('pads only while the keyboard is up', () => {
      const { UNSAFE_getByType } = render(
        <KeyboardAvoider>
          <Text>x</Text>
        </KeyboardAvoider>,
      );
      const enabled = () => UNSAFE_getByType(KeyboardAvoidingView).props.enabled;
      expect(enabled()).toBe(false);
      act(() => listeners.get('keyboardDidShow')?.());
      expect(enabled()).toBe(true);
      act(() => listeners.get('keyboardDidHide')?.());
      expect(enabled()).toBe(false);
    });
  });
});
