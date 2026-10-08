import { render } from '@testing-library/react-native';
import Pueblos from '../pueblos';

const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

it('sends someone who opened /pueblos in the app to the village search', () => {
  render(<Pueblos />);
  expect(mockRedirect).toHaveBeenCalledWith('/descubrir');
});
