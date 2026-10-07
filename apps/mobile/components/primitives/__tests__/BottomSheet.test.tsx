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

  it('closes from the ✕ button', () => {
    const { getByTestId, onClose } = setup();
    fireEvent.press(getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the ✕ found by its accessibility label', () => {
    const onClose = jest.fn();
    const { getByLabelText } = setup(onClose);
    fireEvent.press(getByLabelText('Cerrar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
