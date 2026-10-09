import { render } from '@testing-library/react-native';
import Embajadores from '../embajadores';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

it('sends someone who opened /embajadores in the app to the village search, where they can ask to be Embajador', () => {
  render(<Embajadores />);
  expect(mockRedirect).toHaveBeenCalledWith('/descubrir');
});
