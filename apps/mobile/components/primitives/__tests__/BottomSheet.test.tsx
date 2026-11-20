import { render, fireEvent } from '@testing-library/react-native';
import { KeyboardAvoidingView, Text } from 'react-native';
import { BottomSheet, shouldDismissOnRelease } from '../BottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

describe('shouldDismissOnRelease', () => {
  it('dismisses on a long pull', () => {
    expect(shouldDismissOnRelease(120, 0)).toBe(true);
  });

  it('dismisses on a fast flick even when barely dragged', () => {
    expect(shouldDismissOnRelease(20, 1.2)).toBe(true);
  });

  it('springs back on a short, slow drag', () => {
    expect(shouldDismissOnRelease(30, 0.1)).toBe(false);
  });

  it('needs a shorter pull on a short sheet', () => {
    expect(shouldDismissOnRelease(60, 0.1, 180)).toBe(true);
    expect(shouldDismissOnRelease(40, 0.1, 180)).toBe(false);
  });

  it('never needs more than the fixed pull on a tall sheet', () => {
    expect(shouldDismissOnRelease(95, 0.1, 800)).toBe(true);
  });

  it('never dismisses on an upward drag', () => {
    expect(shouldDismissOnRelease(-200, -2)).toBe(false);
  });
});

describe('<BottomSheet>', () => {
  function setup(onClose = jest.fn()) {
    const utils = render(
      <BottomSheet visible onClose={onClose} title="Título" closeLabel="Cerrar" testID="sheet">
        <Text>contenido</Text>
      </BottomSheet>,
    );
    return { ...utils, onClose };
  }

  // A Modal is its own edge-to-edge window on Android, so it does not resize
  // for the keyboard either: a field in the sheet would sit under it.
  it('lifts above the keyboard', () => {
    const { UNSAFE_getByType } = setup();
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  it('renders its title and children when visible', () => {
    const { getByText } = setup();
    expect(getByText('Título')).toBeTruthy();
    expect(getByText('contenido')).toBeTruthy();
  });

  it('renders nothing when not visible', () => {
    const { queryByText } = render(
      <BottomSheet visible={false} onClose={jest.fn()} closeLabel="Cerrar">
        <Text>contenido</Text>
      </BottomSheet>,
    );
    expect(queryByText('contenido')).toBeNull();
  });

  // No ✕ (decided 2026-11-20): the grab bar is the only visible way out.
  it('has no ✕ button', () => {
    const { queryByTestId, UNSAFE_queryAllByProps } = setup();
    expect(queryByTestId('sheet-close')).toBeNull();
    expect(UNSAFE_queryAllByProps({ name: 'close' })).toHaveLength(0);
  });

  it('closes when the grab bar is tapped', () => {
    const { getByTestId, onClose } = setup();
    fireEvent.press(getByTestId('sheet-handle'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes the grab bar to screen readers as the close button', () => {
    const onClose = jest.fn();
    const { getByLabelText } = setup(onClose);
    const handle = getByLabelText('Cerrar');
    expect(handle.props.accessibilityRole).toBe('button');
    fireEvent.press(handle);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('puts the drag gesture on the grab area, not on the body', () => {
    const { getByTestId } = setup();
    expect(getByTestId('sheet-grab').props.onMoveShouldSetResponderCapture).toEqual(expect.any(Function));
    expect(getByTestId('sheet').props.onMoveShouldSetResponderCapture).toBeUndefined();
  });
});
