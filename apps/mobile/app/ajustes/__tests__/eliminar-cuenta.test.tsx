import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DeleteAccountScreen from '../eliminar-cuenta';

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}));
jest.mock('../../../components/layout/ScreenHeader', () => ({ ScreenHeader: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSignOut = jest.fn();
const mockUseAuth = jest.fn();
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockCheckAccountDeletable = jest.fn();
const mockDeleteAccount = jest.fn();
jest.mock('@cultuvilla/shared/services/accountService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/accountService')>(
      '@cultuvilla/shared/services/accountService',
      () => ({
        checkAccountDeletable: (...args: unknown[]) => mockCheckAccountDeletable(...args),
        deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
        isReauthRequiredError: (e: unknown) => (e as { reauth?: boolean } | null)?.reauth === true,
      }),
    ),
);
jest.mock('../../../lib/auth/reportAuthError', () => ({
  reportAuthError: jest.fn(),
  isCancelledAuthError: (e: unknown) => (e as { code?: string } | null)?.code === 'auth/cancelled',
}));

const REAUTH_REQUIRED = { reauth: true };
const mockReauthWithProvider = jest.fn();
const mockSendReauthCode = jest.fn();
const mockReauthWithCode = jest.fn();

function authWith(reauthMethod: 'google' | 'apple' | 'email' | null) {
  return {
    signOut: mockSignOut,
    user: { email: 'ana@example.com' },
    reauthMethod,
    reauthWithProvider: mockReauthWithProvider,
    sendReauthCode: mockSendReauthCode,
    reauthWithCode: mockReauthWithCode,
  };
}

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authWith('email'));
  });

  it('disables the delete button and lists blockers when the account has sole-admin blockers', async () => {
    mockCheckAccountDeletable.mockResolvedValue({
      blockers: [{ scopeType: 'village', scopeId: 'v1', name: 'Villa Ejemplo' }],
    });

    const { findByText } = render(<DeleteAccountScreen />);

    expect(await findByText('settings.deleteAccount.blockerIntro')).toBeTruthy();
    const blockerText = await findByText(/Villa Ejemplo/, { exact: false });
    expect(blockerText).toBeTruthy();
  });

  it('enables the delete button only once the confirm word is typed', async () => {
    mockCheckAccountDeletable.mockResolvedValue({ blockers: [] });

    const { findByText, getByLabelText, getByTestId } = render(<DeleteAccountScreen />);
    await findByText('settings.deleteAccount.warning');

    const submitButton = getByTestId('delete-account-submit');
    expect(submitButton.props.accessibilityState?.disabled ?? true).toBe(true);

    fireEvent.changeText(getByLabelText('settings.deleteAccount.confirmPrompt'), 'ELIMINAR');

    await waitFor(() => {
      expect(getByTestId('delete-account-submit').props.accessibilityState?.disabled).toBe(false);
    });
  });

  it('calls deleteAccount then signOut when confirmed', async () => {
    mockCheckAccountDeletable.mockResolvedValue({ blockers: [] });
    mockDeleteAccount.mockResolvedValue({ ok: true });

    const { findByText, getByLabelText, getByTestId } = render(<DeleteAccountScreen />);
    await findByText('settings.deleteAccount.warning');

    fireEvent.changeText(getByLabelText('settings.deleteAccount.confirmPrompt'), 'ELIMINAR');
    const submitButton = getByTestId('delete-account-submit');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  async function confirmDeletion(rendered: ReturnType<typeof render>) {
    await rendered.findByText('settings.deleteAccount.warning');
    fireEvent.changeText(rendered.getByLabelText('settings.deleteAccount.confirmPrompt'), 'ELIMINAR');
    fireEvent.press(rendered.getByTestId('delete-account-submit'));
  }

  it('signs in again with Google when the sign-in is too old, then deletes', async () => {
    mockUseAuth.mockReturnValue(authWith('google'));
    mockCheckAccountDeletable.mockResolvedValue({ blockers: [] });
    mockDeleteAccount.mockRejectedValueOnce(REAUTH_REQUIRED).mockResolvedValueOnce({ ok: true });
    mockReauthWithProvider.mockResolvedValue(undefined);

    const rendered = render(<DeleteAccountScreen />);
    await confirmDeletion(rendered);

    expect(await rendered.findByText('settings.deleteAccount.reauth.google')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    fireEvent.press(rendered.getByTestId('delete-account-reauth-submit'));

    await waitFor(() => expect(mockReauthWithProvider).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('emails a code to an email account and deletes once it is entered', async () => {
    mockCheckAccountDeletable.mockResolvedValue({ blockers: [] });
    mockDeleteAccount.mockRejectedValueOnce(REAUTH_REQUIRED).mockResolvedValueOnce({ ok: true });
    mockSendReauthCode.mockResolvedValue(undefined);
    mockReauthWithCode.mockResolvedValue(undefined);

    const rendered = render(<DeleteAccountScreen />);
    await confirmDeletion(rendered);

    expect(await rendered.findByText('settings.deleteAccount.reauth.codeSent:ana@example.com')).toBeTruthy();
    expect(mockSendReauthCode).toHaveBeenCalledTimes(1);
    fireEvent.changeText(rendered.getByTestId('delete-account-reauth-code'), '123456');
    fireEvent.press(rendered.getByTestId('delete-account-reauth-submit'));

    await waitFor(() => expect(mockReauthWithCode).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
  });

  it('stays put without an error when the person backs out of the provider sheet', async () => {
    mockUseAuth.mockReturnValue(authWith('apple'));
    mockCheckAccountDeletable.mockResolvedValue({ blockers: [] });
    mockDeleteAccount.mockRejectedValueOnce(REAUTH_REQUIRED);
    mockReauthWithProvider.mockRejectedValue({ code: 'auth/cancelled' });

    const rendered = render(<DeleteAccountScreen />);
    await confirmDeletion(rendered);
    fireEvent.press(await rendered.findByTestId('delete-account-reauth-submit'));

    await waitFor(() => expect(mockReauthWithProvider).toHaveBeenCalled());
    expect(rendered.queryByText('settings.deleteAccount.reauth.error')).toBeNull();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('tells an account with no way to sign in again here to sign out and back in', async () => {
    mockUseAuth.mockReturnValue(authWith(null));
    mockCheckAccountDeletable.mockResolvedValue({ blockers: [] });
    mockDeleteAccount.mockRejectedValueOnce(REAUTH_REQUIRED);

    const rendered = render(<DeleteAccountScreen />);
    await confirmDeletion(rendered);

    expect(await rendered.findByText('settings.deleteAccount.reauth.signInAgain')).toBeTruthy();
  });
});
