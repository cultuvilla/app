import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';

describe('<Button>', () => {
  it('renders children and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress}>Save</Button>);
    fireEvent.press(getByText('Save'));
    expect(onPress).toHaveBeenCalled();
  });

  it('ignores press when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress} disabled>Save</Button>);
    fireEvent.press(getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows spinner when loading', () => {
    const { getByTestId } = render(
      <Button onPress={() => {}} loading testID="b">x</Button>
    );
    expect(getByTestId('b-spinner')).toBeTruthy();
  });

  // The secondary is an outline, never the old peach fill (olive on peach read
  // at 3.3:1), so it never competes with the screen's one filled action.
  it('draws the secondary as a terracotta outline with terracotta text', () => {
    const { getByTestId, getByText } = render(
      <Button variant="secondary" onPress={() => {}} testID="b">Añadir socio</Button>
    );
    const box = String(getByTestId('b').props.className ?? '');
    expect(box).toContain('border-accent');
    expect(box).toContain('bg-transparent');
    expect(box).not.toContain('bg-subtle');
    expect(String(getByText('Añadir socio').props.className ?? '')).toContain('text-accent');
  });
});
