import { render, fireEvent } from '@testing-library/react-native';
import { PasswordInput } from '../PasswordInput';

// The primitive reads its copy through useT(); serve the real catalog.
jest.mock('../../../lib/i18n', () => {
  const actual = jest.requireActual('../../../lib/i18n');
  const { getMessages } = jest.requireActual('@cultuvilla/i18n');
  const i18n = actual.createI18n({ es: getMessages('es') }, 'es');
  return { ...actual, useT: () => i18n };
});

describe('PasswordInput', () => {
  it('toggles secure entry when the reveal button is pressed', () => {
    const { getByTestId } = render(
      <PasswordInput label="Contraseña" value="hunter2" onChangeText={() => {}} testID="pw" />,
    );
    const input = getByTestId('pw-input');
    expect(input.props.secureTextEntry).toBe(true);

    fireEvent.press(getByTestId('pw-toggle'));
    expect(input.props.secureTextEntry).toBe(false);

    fireEvent.press(getByTestId('pw-toggle'));
    expect(input.props.secureTextEntry).toBe(true);
  });
});
