import { render, fireEvent } from '@testing-library/react-native';
import { typography } from '@cultuvilla/shared/design-system';
import { Input } from '../Input';

const flatStyle = (style: unknown) =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;

describe('<Input>', () => {
  it('updates value on change', () => {
    const onChange = jest.fn();
    const { getByDisplayValue } = render(
      <Input value="abc" onChangeText={onChange} />
    );
    fireEvent.changeText(getByDisplayValue('abc'), 'abcd');
    expect(onChange).toHaveBeenCalledWith('abcd');
  });

  it('renders label and error', () => {
    const { getByText } = render(
      <Input label="Email" value="" onChangeText={() => {}} error="Required" />
    );
    expect(getByText('Email')).toBeTruthy();
    expect(getByText('Required')).toBeTruthy();
  });

  it('rests an auto-growing field at one full line of body text', () => {
    const { getByTestId } = render(
      <Input value="" onChangeText={() => {}} testID="field" pill autoGrow />
    );
    expect(flatStyle(getByTestId('field').props.style).height).toBe(typography.body.lineHeight);
  });

  // rounded-full on a grown, multi-line pill becomes a stadium whose curved
  // ends cut across the text — the radius must stay that of a one-line pill.
  it('keeps a fixed capsule radius on a pill instead of rounded-full', () => {
    const { getByTestId } = render(
      <Input value="" onChangeText={() => {}} testID="field" pill autoGrow />
    );
    const wrapper = getByTestId('field').parent?.parent;
    expect(String(wrapper?.props.className ?? '')).not.toContain('rounded-full');
    const radius = flatStyle(wrapper?.props.style).borderRadius;
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThan(typography.body.lineHeight * 2);
  });
});
