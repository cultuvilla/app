import { render, fireEvent } from '@testing-library/react-native';
import { EntityDetailHeader } from '../EntityDetailHeader';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

describe('EntityDetailHeader', () => {
  it('renders a back button and one button per action', () => {
    const back = jest.fn();
    const share = jest.fn();
    const { getByLabelText, getByTestId } = render(
      <EntityDetailHeader
        onBack={back}
        actions={[
          { icon: 'share-outline', onPress: share, accessibilityLabel: 'deeplink.shareViewLabel', testID: 'x-share-action' },
        ]}
      />,
    );
    fireEvent.press(getByLabelText('header.back'));
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent.press(getByLabelText('deeplink.shareViewLabel'));
    expect(share).toHaveBeenCalledTimes(1);
    // The id is what the Maestro flows reach the action by.
    expect(getByTestId('x-share-action')).toBeTruthy();
  });
});
