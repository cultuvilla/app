import { render } from '@testing-library/react-native';
import { Text } from '../Text';
import { MAX_FONT_SIZE_MULTIPLIER } from '../../../lib/text/textScaling';

describe('<Text>', () => {
  it('renders with default body variant', () => {
    const { getByText } = render(<Text>hello</Text>);
    const el = getByText('hello');
    expect(el.props.className).toMatch(/text-body/);
  });

  it('applies h1 variant class', () => {
    const { getByText } = render(<Text variant="h1">title</Text>);
    expect(getByText('title').props.className).toMatch(/text-h1/);
  });

  it('applies muted tone class', () => {
    const { getByText } = render(<Text tone="muted">quiet</Text>);
    expect(getByText('quiet').props.className).toMatch(/text-muted/);
  });

  it('applies onSubtle tone class', () => {
    const { getByText } = render(<Text tone="onSubtle">tinted</Text>);
    expect(getByText('tinted').props.className).toMatch(/text-on-subtle/);
  });

  it('applies danger tone class', () => {
    const { getByText } = render(<Text tone="danger">error</Text>);
    expect(getByText('error').props.className).toMatch(/text-danger/);
  });

  it('caps the OS font scale at 1.5× by default', () => {
    const { getByText } = render(<Text>Fiestas</Text>);
    expect(getByText('Fiestas').props.maxFontSizeMultiplier).toBe(MAX_FONT_SIZE_MULTIPLIER);
  });

  it('applies the scaling preset it is given', () => {
    const { getByText } = render(
      <>
        <Text scaling="label">Unirme</Text>
        <Text scaling="fixed">AP</Text>
      </>,
    );
    expect(getByText('Unirme').props.maxFontSizeMultiplier).toBe(1.3);
    expect(getByText('AP').props.maxFontSizeMultiplier).toBe(1);
  });
});
