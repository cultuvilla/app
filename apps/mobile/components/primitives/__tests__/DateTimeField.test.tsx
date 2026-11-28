import { render, fireEvent } from '@testing-library/react-native';
import { DateTimeField } from '../DateTimeField';

// The primitive reads its copy through useT(); serve the real catalog.
jest.mock('../../../lib/i18n', () => {
  const actual = jest.requireActual('../../../lib/i18n');
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const i18n = actual.createI18n({ es: getMessages('es') }, 'es');
  return { ...actual, useT: () => i18n };
});

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

it('shows distinct date and time placeholders when empty', () => {
  const { getByTestId } = render(
    <DateTimeField
      label="Inicio"
      value={null}
      onChange={jest.fn()}
      datePlaceholder="Seleccionar fecha"
      timePlaceholder="Seleccionar hora"
      testID="dt"
    />,
  );
  expect(getByTestId('dt-date')).toHaveTextContent('Seleccionar fecha');
  expect(getByTestId('dt-time')).toHaveTextContent('Seleccionar hora');
});

it('picks a day, preserving the time', () => {
  const onChange = jest.fn();
  const { getByTestId } = render(
    <DateTimeField label="Inicio" value={new Date(2026, 6, 1, 9, 0)} onChange={onChange} testID="dt" />,
  );
  fireEvent.press(getByTestId('dt-date'));
  fireEvent.press(getByTestId('dt-date-calendar-day-2026-07-05'));
  const d = onChange.mock.calls.at(-1)![0] as Date;
  expect(d.getDate()).toBe(5);
  expect(d.getHours()).toBe(9);
});

it('picks a minute on the clock, preserving the date and closing the modal', () => {
  const onChange = jest.fn();
  const { getByTestId, queryByTestId } = render(
    <DateTimeField label="Inicio" value={new Date(2026, 6, 1, 9, 0)} onChange={onChange} testID="dt" />,
  );
  fireEvent.press(getByTestId('dt-time'));
  fireEvent.press(getByTestId('dt-time-picker-hour-14')); // advances to minute page
  fireEvent.press(getByTestId('dt-time-picker-minute-30'));
  const d = onChange.mock.calls.at(-1)![0] as Date;
  expect(d.getHours()).toBe(14);
  expect(d.getMinutes()).toBe(30);
  expect(d.getDate()).toBe(1);
  expect(queryByTestId('dt-time-picker')).toBeNull(); // modal closed after minute pick
});

it('hides the date button when timeOnly', () => {
  const { getByTestId, queryByTestId } = render(
    <DateTimeField label="Fin" value={null} onChange={jest.fn()} timeOnly testID="dt" />,
  );
  expect(queryByTestId('dt-date')).toBeNull();
  expect(getByTestId('dt-time')).toBeTruthy();
});
