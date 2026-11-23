import { render } from '@testing-library/react-native';
import { Avatar } from '../Avatar';

describe('Avatar', () => {
  it('carries no seal by default', () => {
    const { queryByTestId } = render(<Avatar initials="L" size={48} />);
    expect(queryByTestId('avatar-ambassador-seal')).toBeNull();
  });

  it('stamps the Cultuvilla seal on an Embajador', () => {
    const { getByTestId } = render(<Avatar initials="L" size={48} ambassador />);
    expect(getByTestId('avatar-ambassador-seal')).toBeTruthy();
  });

  it('keeps the seal legible on a tiny avatar', () => {
    const { getByTestId } = render(<Avatar initials="L" size={24} ambassador />);
    const style = [getByTestId('avatar-ambassador-seal').props.style].flat();
    const width = style.find((s: { width?: number } | undefined) => s?.width != null)?.width;
    expect(width).toBe(16);
  });

  // QA pass 2026-11-18: «AP» at the fixed h2 size overflowed the 32dp circles
  // of the village Personas list.
  it('sizes two initials to fit a small circle', () => {
    const { getByText } = render(<Avatar initials="AP" size={32} />);
    const style = [getByText('AP').props.style].flat();
    const fontSize = style.find((s: { fontSize?: number } | undefined) => s?.fontSize != null)?.fontSize;
    expect(fontSize).toBeLessThanOrEqual(32 * 0.4);
    expect(getByText('AP').props.maxFontSizeMultiplier).toBe(1);
  });

  it('keeps the h2 size on a large avatar', () => {
    const { getByText } = render(<Avatar initials="AP" size={96} />);
    const style = [getByText('AP').props.style].flat();
    const fontSize = style.find((s: { fontSize?: number } | undefined) => s?.fontSize != null)?.fontSize;
    expect(fontSize).toBe(24);
  });
});
