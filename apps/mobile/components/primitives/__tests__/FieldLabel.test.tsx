import { render } from '@testing-library/react-native';
import { FieldLabel } from '../FieldLabel';

describe('FieldLabel', () => {
  it('renders just the label for an optional field', () => {
    const { getByText } = render(<FieldLabel>Ubicación</FieldLabel>);
    expect(getByText('Ubicación')).toHaveTextContent('Ubicación', { exact: true });
  });

  it('appends an asterisk for a required field', () => {
    const { getByText } = render(<FieldLabel required>Ubicación</FieldLabel>);
    expect(getByText(/Ubicación/)).toHaveTextContent('Ubicación *');
  });
});
