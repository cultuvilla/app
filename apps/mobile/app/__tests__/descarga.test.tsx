import { render } from '@testing-library/react-native';
import Descarga from '../descarga';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

it('sends someone who opened /descarga in the app straight home', () => {
  render(<Descarga />);
  expect(mockRedirect).toHaveBeenCalledWith('/(tabs)');
});
