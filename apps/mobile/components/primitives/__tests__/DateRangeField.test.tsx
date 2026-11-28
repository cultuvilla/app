import { render, fireEvent } from '@testing-library/react-native';
import { DateRangeField } from '../DateRangeField';

// The primitive reads its copy through useT(); serve the real catalog.
jest.mock('../../../lib/i18n', () => {
  const actual = jest.requireActual('../../../lib/i18n');
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const i18n = actual.createI18n({ es: getMessages('es') }, 'es');
  return { ...actual, useT: () => i18n };
});

describe('DateRangeField', () => {
  it('shows the placeholder, then the picked range', () => {
    const { getByText, rerender } = render(<DateRangeField label="Santiago" value={null} onChange={() => {}} />);
    expect(getByText('Elegir fechas')).toBeTruthy();
    rerender(
      <DateRangeField label="Santiago" value={{ startDay: '2026-07-24', endDay: '2026-07-26' }} onChange={() => {}} />,
    );
    expect(getByText('24 – 26 jul')).toBeTruthy();
  });

  it('picks a range in two taps and emits it only on Listo', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DateRangeField label="Carmen" value={null} onChange={onChange} initialMonth={new Date(2026, 7, 1)} testID="r" />,
    );
    fireEvent.press(getByTestId('r-trigger'));
    fireEvent.press(getByTestId('r-calendar-day-2026-08-14'));
    expect(getByTestId('r-confirm').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(getByTestId('r-calendar-day-2026-08-28'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('r-confirm'));
    expect(onChange).toHaveBeenCalledWith({ startDay: '2026-08-14', endDay: '2026-08-28' });
  });

  it('refuses days past the last allowed day', () => {
    const { getByTestId } = render(
      <DateRangeField
        label="Periodo"
        value={{ startDay: '2026-09-01', endDay: '2026-09-10' }}
        onChange={() => {}}
        maxDay="2026-09-14"
        testID="r"
      />,
    );
    fireEvent.press(getByTestId('r-trigger'));
    expect(getByTestId('r-calendar-day-2026-09-15').props.accessibilityState).toMatchObject({ disabled: true });
    expect(getByTestId('r-calendar-day-2026-09-14').props.accessibilityState).toMatchObject({ disabled: false });
  });
});
