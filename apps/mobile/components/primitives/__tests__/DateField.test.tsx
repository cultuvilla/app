import { render, fireEvent } from '@testing-library/react-native';
import { DateField } from '../DateField';

// The primitive reads its copy through useT(); serve the real catalog.
jest.mock('../../../lib/i18n', () => {
  const actual = jest.requireActual('../../../lib/i18n');
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const i18n = actual.createI18n({ es: getMessages('es') }, 'es');
  return { ...actual, useT: () => i18n };
});

describe('DateField (calendar)', () => {
  it('shows the label placeholder when empty', () => {
    const { getByText } = render(<DateField label="Cumpleaños" value={null} onChange={() => {}} />);
    expect(getByText('Cumpleaños')).toBeTruthy();
  });

  it('opens the calendar and emits the picked day', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DateField label="Fecha" value={new Date(2026, 6, 1)} onChange={onChange} testID="d" />,
    );
    fireEvent.press(getByTestId('d-trigger'));
    fireEvent.press(getByTestId('d-calendar-day-2026-07-20'));
    const picked = onChange.mock.calls.at(-1)![0] as Date;
    expect(picked.getMonth()).toBe(6);
    expect(picked.getDate()).toBe(20);
  });
});
