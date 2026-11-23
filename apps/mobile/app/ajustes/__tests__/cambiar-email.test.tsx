import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ChangeEmailScreen from '../cambiar-email';
import { ReauthRequiredError } from '../../../lib/auth/AuthContext';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) },
}));
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (key: string) => key }),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));

const mockChangeEmail = jest.fn();
const mockUseAuth = jest.fn();
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ChangeEmailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      changeEmail: mockChangeEmail,
      canChangeEmail: true,
    });
  });

  type Screen = ReturnType<typeof render>;

  function fillAndSubmit(
    getByLabelText: Screen['getByLabelText'],
    getByText: Screen['getByText'],
    email: string,
  ) {
    fireEvent.changeText(getByLabelText('settings.changeEmail.newEmailPlaceholder'), email);
    fireEvent.press(getByText('settings.changeEmail.submit'));
  }

  it('calls changeEmail with the entered new email', async () => {
    mockChangeEmail.mockResolvedValue(undefined);
    const { getByLabelText, getByText } = render(<ChangeEmailScreen />);
    fillAndSubmit(getByLabelText, getByText, 'new@example.com');
    await waitFor(() => expect(mockChangeEmail).toHaveBeenCalledWith('new@example.com'));
  });

  it('shows the sent-to-new-email notice on success', async () => {
    mockChangeEmail.mockResolvedValue(undefined);
    const { getByLabelText, getByText, findByText } = render(<ChangeEmailScreen />);
    fillAndSubmit(getByLabelText, getByText, 'new@example.com');
    expect(await findByText('settings.changeEmail.sentToNewEmail')).toBeTruthy();
  });

  it('shows the reauth notice when changeEmail throws ReauthRequiredError', async () => {
    mockChangeEmail.mockRejectedValue(new ReauthRequiredError());
    const { getByLabelText, getByText, findByText } = render(<ChangeEmailScreen />);
    fillAndSubmit(getByLabelText, getByText, 'new@example.com');
    expect(await findByText('settings.changeEmail.reauthNotice')).toBeTruthy();
  });

  it('maps auth/email-already-in-use to the mapped error string', async () => {
    mockChangeEmail.mockRejectedValue({ code: 'auth/email-already-in-use' });
    const { getByLabelText, getByText, findByText } = render(<ChangeEmailScreen />);
    fillAndSubmit(getByLabelText, getByText, 'new@example.com');
    expect(await findByText('settings.changeEmail.error.emailInUse')).toBeTruthy();
  });

  it('maps an unknown error code to the generic error string', async () => {
    mockChangeEmail.mockRejectedValue({ code: 'auth/network-request-failed' });
    const { getByLabelText, getByText, findByText } = render(<ChangeEmailScreen />);
    fillAndSubmit(getByLabelText, getByText, 'new@example.com');
    expect(await findByText('settings.changeEmail.error.generic')).toBeTruthy();
  });

  it('rejects a malformed address locally without calling changeEmail', async () => {
    const { getByLabelText, getByText, findByText } = render(<ChangeEmailScreen />);
    fillAndSubmit(getByLabelText, getByText, 'new@example');
    expect(await findByText('settings.changeEmail.error.invalidEmail')).toBeTruthy();
    expect(mockChangeEmail).not.toHaveBeenCalled();
  });

  it('redirects to /ajustes and renders no form when the account cannot change email', async () => {
    mockUseAuth.mockReturnValue({ changeEmail: mockChangeEmail, canChangeEmail: false });
    const { queryByText } = render(<ChangeEmailScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ajustes'));
    expect(queryByText('settings.changeEmail.submit')).toBeNull();
  });
});
