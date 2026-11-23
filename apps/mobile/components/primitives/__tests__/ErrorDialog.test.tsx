import { fireEvent, render } from '@testing-library/react-native';
import { ErrorDialog } from '../ErrorDialog';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

// A ZodError's `message` is a pretty-printed JSON array of issues, and an
// `invalid_enum_value` one lists every valid option. This is what an older
// store binary put on screen when the Buzón's strict converter rejected a
// notification type the binary predates.
const ZOD_ERROR = JSON.stringify(
  [
    {
      received: 'village_entity_published',
      code: 'invalid_enum_value',
      options: Array.from({ length: 19 }, (_, i) => `notification_type_${String(i)}`),
      path: ['type'],
      message: 'Invalid enum value.',
    },
  ],
  null,
  2,
);

describe('<ErrorDialog>', () => {
  it('renders nothing when there is no message', () => {
    const { queryByTestId } = render(<ErrorDialog message={null} onDismiss={jest.fn()} />);
    expect(queryByTestId('error-dialog')).toBeNull();
  });

  it('shows the message', () => {
    const { getByText } = render(<ErrorDialog message="Algo ha fallado" onDismiss={jest.fn()} />);
    expect(getByText('Algo ha fallado')).toBeTruthy();
  });

  it('keeps the dismiss button reachable when the message is enormous', () => {
    // The original hand-rolled modal was vertically centred with no height cap,
    // so a message this long pushed its only button off-screen — and iOS Modal
    // has no swipe-to-dismiss and fires onRequestClose only on Android back.
    const onDismiss = jest.fn();
    const { getByTestId } = render(<ErrorDialog message={ZOD_ERROR} onDismiss={onDismiss} />);

    // jest-expo renders ScrollView down to its host component, so the host
    // name is what proves the body actually scrolls rather than overflowing.
    expect(getByTestId('error-dialog-body').type).toBe('RCTScrollView');

    fireEvent.press(getByTestId('error-dialog-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('offers the sheet close affordance as a second way out', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(<ErrorDialog message={ZOD_ERROR} onDismiss={onDismiss} />);
    fireEvent.press(getByTestId('error-dialog-handle'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
