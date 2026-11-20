import { render, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../index';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));

const mockUseAuth = jest.fn();
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockSetUsageAnalytics = jest.fn().mockResolvedValue(undefined);
let mockAnalyticsAnswer: boolean | null | undefined = null;
jest.mock('../../../lib/observability/AnalyticsConsentProvider', () => ({
  useAnalyticsConsent: () => ({ answer: mockAnalyticsAnswer, setUsageAnalytics: mockSetUsageAnalytics }),
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyticsAnswer = null;
    mockUseAuth.mockReturnValue({
      profile: { email: 'ana@test.com', displayName: 'Ana Gil' },
      canChangeEmail: true,
    });
  });

  it('renders the read-only email and displayName', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Ana Gil')).toBeTruthy();
    expect(getByText('ana@test.com')).toBeTruthy();
  });

  it('shows the Cuenta section with two rows', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('settings.section.account')).toBeTruthy();
    expect(getByText('settings.changeEmail.label')).toBeTruthy();
    expect(getByText('settings.deleteAccount.label')).toBeTruthy();
  });

  it('navigates to /ajustes/cambiar-email when tapping "Cambiar correo"', () => {
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('settings.changeEmail.label'));
    expect(mockPush).toHaveBeenCalledWith('/ajustes/cambiar-email');
  });

  it('navigates to /ajustes/eliminar-cuenta when tapping "Eliminar cuenta"', () => {
    const { getByText } = render(<SettingsScreen />);
    fireEvent.press(getByText('settings.deleteAccount.label'));
    expect(mockPush).toHaveBeenCalledWith('/ajustes/eliminar-cuenta');
  });

  it('disables the change-email row and shows the hint when the account cannot change email', () => {
    mockUseAuth.mockReturnValue({
      profile: { email: 'ana@test.com', displayName: 'Ana Gil' },
      canChangeEmail: false,
    });
    const { getByText, queryByText } = render(<SettingsScreen />);
    expect(getByText('settings.changeEmail.googleDisabledHint')).toBeTruthy();
    mockPush.mockClear();
    fireEvent.press(getByText('settings.changeEmail.label'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(queryByText('settings.changeEmail.googleDisabledHint')).toBeTruthy();
  });

  describe('Estadísticas de uso switch', () => {
    it('is off for an account that never answered, and turning it on records a yes', () => {
      const { getByTestId } = render(<SettingsScreen />);
      const toggle = getByTestId('settings-usage-analytics');
      expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
      fireEvent.press(toggle);
      expect(mockSetUsageAnalytics).toHaveBeenCalledWith(true);
    });

    it('shows a yes as on, and turning it off records a no', () => {
      mockAnalyticsAnswer = true;
      const { getByTestId } = render(<SettingsScreen />);
      const toggle = getByTestId('settings-usage-analytics');
      expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
      fireEvent.press(toggle);
      expect(mockSetUsageAnalytics).toHaveBeenCalledWith(false);
    });

    it('cannot be flipped while the answer is still loading', () => {
      mockAnalyticsAnswer = undefined;
      const { getByTestId } = render(<SettingsScreen />);
      fireEvent.press(getByTestId('settings-usage-analytics'));
      expect(mockSetUsageAnalytics).not.toHaveBeenCalled();
    });
  });
});
