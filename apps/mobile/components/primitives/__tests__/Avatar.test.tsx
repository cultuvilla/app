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
});
