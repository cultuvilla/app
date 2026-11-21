import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EntityChoicePicker } from '../EntityChoicePicker';

jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string) =>
      ({
        'censo.entityPicker.placeholder': 'Selecciona una opción',
        'common.done': 'Listo',
      })[key] ?? key,
  }),
}));

const options = [
  { value: 'plaza', label: 'Plaza Mayor', imageUri: 'https://example.com/plaza.jpg' },
  { value: 'fronton', label: 'Frontón', imageUri: null },
];

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderPicker(props: React.ComponentProps<typeof EntityChoicePicker>) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <EntityChoicePicker {...props} />
    </SafeAreaProvider>,
  );
}

it('keeps entity options collapsed until the trigger is pressed', () => {
  const { getByText, queryByText } = renderPicker(
    {
      title: 'Lugar favorito',
      options,
      mode: 'single',
      value: undefined,
      onChange: jest.fn(),
    },
  );

  expect(queryByText('Plaza Mayor')).toBeNull();
  fireEvent.press(getByText('Selecciona una opción'));
  expect(getByText('Plaza Mayor')).toBeTruthy();
});

it('shows option images and selects a single entity', () => {
  const onChange = jest.fn();
  const { getByText, getByTestId, queryByText } = renderPicker(
    {
      title: 'Lugar favorito',
      options,
      mode: 'single',
      value: undefined,
      onChange,
    },
  );

  fireEvent.press(getByText('Selecciona una opción'));
  // expo-image normalizes `source` into an array of sources.
  expect(getByTestId('entity-option-image-plaza').props.source).toEqual([
    { uri: 'https://example.com/plaza.jpg' },
  ]);
  fireEvent.press(getByText('Plaza Mayor'));

  expect(onChange).toHaveBeenCalledWith('plaza');
  expect(queryByText('Frontón')).toBeNull();
});

// No ✕ (decided 2026-11-20): the grab bar is the way out.
it('closes the picker from its grab bar (entity-choice-sheet-handle)', () => {
  const { getByText, getByTestId, queryByText } = renderPicker({
    title: 'Lugar favorito',
    options,
    mode: 'single',
    value: undefined,
    onChange: jest.fn(),
  });
  fireEvent.press(getByText('Selecciona una opción'));
  expect(getByTestId('entity-choice-sheet')).toBeTruthy();
  fireEvent.press(getByTestId('entity-choice-sheet-handle'));
  expect(queryByText('Plaza Mayor')).toBeNull();
});
