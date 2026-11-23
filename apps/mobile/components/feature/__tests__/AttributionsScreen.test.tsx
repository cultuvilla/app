import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { I18nProvider } from '../../../lib/i18n';
import { AttributionsScreen, OSM_COPYRIGHT_URL } from '../AttributionsScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../layout/ScreenHeader', () => ({ ScreenHeader: () => null }));

const renderScreen = () =>
  render(
    <I18nProvider>
      <AttributionsScreen />
    </I18nProvider>,
  );

describe('AttributionsScreen', () => {
  it('carries the credit ODbL requires, verbatim', () => {
    // The licence asks for this exact wording; a translated or reworded credit
    // would not satisfy it.
    const { getByText } = renderScreen();
    expect(getByText('© OpenStreetMap contributors')).toBeTruthy();
  });

  it('links to the OpenStreetMap copyright page', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByText } = renderScreen();
    fireEvent.press(getByText('Ver la licencia en openstreetmap.org'));
    expect(open).toHaveBeenCalledWith(OSM_COPYRIGHT_URL);
    open.mockRestore();
  });
});
