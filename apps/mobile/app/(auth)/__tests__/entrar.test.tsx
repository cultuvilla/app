import { fireEvent, render, waitFor } from '@testing-library/react-native';
import LoginScreen from '../entrar';

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    locale: 'es',
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockSendOtpCode = jest.fn();
const mockVerifyOtpCode = jest.fn();
const mockSignInWithGoogle = jest.fn();
const mockSignInWithApple = jest.fn();
const mockSignInWithDevAccount = jest.fn();

const mockUseAuth = jest.fn();
jest.mock('../../../lib/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({
    sendOtpCode: mockSendOtpCode,
    verifyOtpCode: mockVerifyOtpCode,
    signInWithGoogle: mockSignInWithGoogle,
    signInWithApple: mockSignInWithApple,
    devAccounts: [],
    signInWithDevAccount: mockSignInWithDevAccount,
  });
});

const EMAIL = 'ana@correo.com';

function submitEmail(getByTestId: ReturnType<typeof render>['getByTestId'], email = EMAIL) {
  fireEvent.changeText(getByTestId('login-email-input'), email);
  fireEvent.press(getByTestId('login-submit'));
}

describe('<LoginScreen>', () => {
  describe('invalid email', () => {
    it('warns inline and never asks the server for a code', async () => {
      const { getByTestId, findByText, queryByTestId } = render(<LoginScreen />);

      submitEmail(getByTestId, 'ana@correo');

      await findByText('auth.login.invalidEmail');
      expect(mockSendOtpCode).not.toHaveBeenCalled();
      expect(queryByTestId('login-code-input')).toBeNull();
    });

    it('warns when leaving the field with an invalid address, and clears on edit', async () => {
      const { getByTestId, findByText, queryByText } = render(<LoginScreen />);
      const input = getByTestId('login-email-input');

      fireEvent.changeText(input, 'ana');
      expect(queryByText('auth.login.invalidEmail')).toBeNull();
      fireEvent(input, 'blur');
      await findByText('auth.login.invalidEmail');

      fireEvent.changeText(input, 'ana@correo.com');
      expect(queryByText('auth.login.invalidEmail')).toBeNull();
    });

    it('stays quiet when leaving an empty field', () => {
      const { getByTestId, queryByText } = render(<LoginScreen />);
      fireEvent(getByTestId('login-email-input'), 'blur');
      expect(queryByText('auth.login.invalidEmail')).toBeNull();
    });
  });

  it('sends a code and advances to the code step', async () => {
    mockSendOtpCode.mockResolvedValue(undefined);
    const { getByTestId, queryByTestId } = render(<LoginScreen />);

    submitEmail(getByTestId);

    await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());
    expect(mockSendOtpCode).toHaveBeenCalledTimes(1);
    expect(queryByTestId('login-submit')).toBeNull();
  });

  it('shows an error and stays on the email step when sending the code fails', async () => {
    mockSendOtpCode.mockRejectedValue(new Error('Email inválido.'));
    const { getByTestId, queryByTestId, findByText } = render(<LoginScreen />);

    submitEmail(getByTestId);

    await findByText('Email inválido.');
    expect(queryByTestId('login-code-input')).toBeNull();
  });

  it('verifies the code once entered', async () => {
    mockSendOtpCode.mockResolvedValue(undefined);
    mockVerifyOtpCode.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);

    submitEmail(getByTestId);
    await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());

    fireEvent.changeText(getByTestId('login-code-input'), '123456');
    fireEvent.press(getByTestId('login-verify-code'));

    await waitFor(() => expect(mockVerifyOtpCode).toHaveBeenCalledWith(EMAIL, '123456'));
  });

  it('resends the code from the code step', async () => {
    mockSendOtpCode.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);

    submitEmail(getByTestId);
    await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());

    fireEvent.press(getByTestId('login-resend-code'));

    await waitFor(() => expect(mockSendOtpCode).toHaveBeenCalledTimes(2));
  });

  it('goes back to the email step so a typo can be corrected before verifying', async () => {
    mockSendOtpCode.mockResolvedValue(undefined);
    const { getByTestId, queryByTestId } = render(<LoginScreen />);

    submitEmail(getByTestId);
    await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());
    fireEvent.changeText(getByTestId('login-code-input'), '123456');

    fireEvent.press(getByTestId('login-change-email'));

    // Back on the email step, with the stale code discarded.
    await waitFor(() => expect(getByTestId('login-submit')).toBeTruthy());
    expect(queryByTestId('login-code-input')).toBeNull();
    submitEmail(getByTestId);
    await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());
    expect(getByTestId('login-code-input').props.value).toBe('');
  });

  // Regression: a bad connection during signup used to render the SDK's own
  // developer string ("Firebase: Error (auth/network-request-failed).") straight
  // into the danger text under the input.
  describe('connection failures', () => {
    const networkError = () =>
      Object.assign(new Error('Firebase: Error (auth/network-request-failed).'), {
        code: 'auth/network-request-failed',
      });

    it('shows connection copy, not the raw Firebase string, when sending the code fails', async () => {
      mockSendOtpCode.mockRejectedValue(networkError());
      const { getByTestId, findByText, queryByText } = render(<LoginScreen />);

      submitEmail(getByTestId);

      await findByText(/conexión/i);
      expect(queryByText(/Firebase:/)).toBeNull();
      expect(queryByText(/auth\//)).toBeNull();
    });

    it('shows connection copy when verifying the code fails', async () => {
      mockSendOtpCode.mockResolvedValue(undefined);
      mockVerifyOtpCode.mockRejectedValue(networkError());
      const { getByTestId, findByText, queryByText } = render(<LoginScreen />);

      submitEmail(getByTestId);
      await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());
      fireEvent.changeText(getByTestId('login-code-input'), '123456');
      fireEvent.press(getByTestId('login-verify-code'));

      await findByText(/conexión/i);
      expect(queryByText(/Firebase:/)).toBeNull();
    });

    it('shows connection copy when Google sign-in fails', async () => {
      mockSignInWithGoogle.mockRejectedValue(networkError());
      const { getByTestId, findByText, queryByText } = render(<LoginScreen />);

      fireEvent.press(getByTestId('login-google-button'));

      await findByText(/conexión/i);
      expect(queryByText(/Firebase:/)).toBeNull();
    });

    // The server's own Spanish copy is more useful than any generic message,
    // so the classifier must not swallow it.
    it('still shows the server message for a rejected code', async () => {
      mockSendOtpCode.mockResolvedValue(undefined);
      mockVerifyOtpCode.mockRejectedValue(
        Object.assign(new Error('Código incorrecto o caducado.'), {
          code: 'functions/invalid-argument',
        }),
      );
      const { getByTestId, findByText } = render(<LoginScreen />);

      submitEmail(getByTestId);
      await waitFor(() => expect(getByTestId('login-code-input')).toBeTruthy());
      fireEvent.press(getByTestId('login-verify-code'));

      await findByText('Código incorrecto o caducado.');
    });
  });

  it('calls signInWithGoogle from the Google button', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);

    fireEvent.press(getByTestId('login-google-button'));

    await waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1));
  });

  // The RN jest preset defaults Platform.OS to 'ios', which is exactly the
  // one platform the Apple button must render on.
  it('calls signInWithApple from the Apple button', async () => {
    mockSignInWithApple.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);

    fireEvent.press(getByTestId('login-apple-button'));

    await waitFor(() => expect(mockSignInWithApple).toHaveBeenCalledTimes(1));
  });

  describe('dev login buttons', () => {
    it('are absent when the build carries no dev accounts', () => {
      const { queryByTestId } = render(<LoginScreen />);
      expect(queryByTestId('login-dev-account-demo-vecino@cultuvilla.dev')).toBeNull();
    });

    it('sign into the tapped account', async () => {
      mockSignInWithDevAccount.mockResolvedValue(undefined);
      mockUseAuth.mockReturnValue({
        ...mockUseAuth(),
        devAccounts: ['demo-vecino@cultuvilla.dev', 'demo-admin@cultuvilla.dev'],
      });
      const { getByTestId } = render(<LoginScreen />);

      fireEvent.press(getByTestId('login-dev-account-demo-admin@cultuvilla.dev'));

      await waitFor(() =>
        expect(mockSignInWithDevAccount).toHaveBeenCalledWith('demo-admin@cultuvilla.dev'),
      );
    });
  });
});
