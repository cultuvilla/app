import { act, fireEvent, render } from '@testing-library/react-native';
import { KeyboardAvoidingView, Text, View } from 'react-native';
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
});
