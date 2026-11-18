import { render, fireEvent } from '@testing-library/react-native';
import { Toggle } from '../Toggle';

describe('<Toggle>', () => {
  it('calls onValueChange with the toggled value', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Toggle value={false} onValueChange={onChange} testID="t" />);
    fireEvent.press(getByTestId('t'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onValueChange with false when value is true', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Toggle value={true} onValueChange={onChange} testID="t2" />);
    fireEvent.press(getByTestId('t2'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  // Used by frozen settings (e.g. an event's group size once people have signed
  // up): the value still has to be readable, it just can't be flipped.
  it('does not fire onValueChange when disabled', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <Toggle value={true} onValueChange={onChange} disabled testID="t3" />,
    );
    fireEvent.press(getByTestId('t3'));
    expect(onChange).not.toHaveBeenCalled();
    expect(getByTestId('t3').props.accessibilityState).toMatchObject({
      checked: true,
      disabled: true,
    });
  });

  it('renders label when provided', () => {
    const { getByText } = render(
      <Toggle value={false} onValueChange={jest.fn()} label="Acepto términos" />
    );
    expect(getByText('Acepto términos')).toBeTruthy();
  });

  // QA pass 2026-11-18: «Los integrantes del grupo son visibles para el pu…»
  // ran off the right edge of the add-group form instead of wrapping.
  it('lets a long label wrap beside the switch instead of overflowing', () => {
    const label = 'Los integrantes del grupo son visibles para el pueblo';
    const { getByText } = render(<Toggle value onValueChange={jest.fn()} label={label} />);
    expect(getByText(label).props.className).toMatch(/\bshrink\b/);
    expect(getByText(label).props.numberOfLines).toBeUndefined();
  });
});
