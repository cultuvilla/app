import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { approveStudioPairing, inspectStudioPairing } from '@cultuvilla/shared/services/studioService';
import StudioPairingScreen from '../vincular/[id]';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'pairing-123' }),
  router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
const mockAuth: { user: { uid: string } | null } = { user: { uid: 'u1' } };
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: () => mockAuth }));
const mockRequireAuth = jest.fn();
jest.mock('../../../lib/auth/RegisterGateContext', () => ({
  useRegisterGate: () => ({ requireAuth: mockRequireAuth }),
}));
jest.mock('@cultuvilla/shared/services/studioService', () => ({
  inspectStudioPairing: jest.fn(),
  approveStudioPairing: jest.fn(),
}));

const inspect = inspectStudioPairing as jest.Mock;
const approve = approveStudioPairing as jest.Mock;

describe('studio pairing screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.user = { uid: 'u1' };
    inspect.mockResolvedValue({ code: 'K7P2', expiresAt: Date.now() + 60_000 });
    approve.mockResolvedValue(undefined);
  });

  it('shows the studio code and signs the studio in on confirm', async () => {
    const { findByTestId, getByTestId } = render(<StudioPairingScreen />);
    expect((await findByTestId('studio-pairing-code')).props.children).toBe('K7P2');
    fireEvent.press(getByTestId('studio-pairing-approve'));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('pairing-123'));
    expect((await findByTestId('studio-pairing-result')).props.children).toBe('studio.pairing.done');
  });

  it('approves nothing when the user says it is not their computer', async () => {
    const { findByTestId, getByTestId } = render(<StudioPairingScreen />);
    await findByTestId('studio-pairing-code');
    fireEvent.press(getByTestId('studio-pairing-cancel'));
    expect((await findByTestId('studio-pairing-result')).props.children).toBe('studio.pairing.cancelled');
    expect(approve).not.toHaveBeenCalled();
  });

  it('explains an expired code', async () => {
    inspect.mockRejectedValue(Object.assign(new Error('gone'), { code: 'functions/not-found' }));
    const { findByTestId } = render(<StudioPairingScreen />);
    expect((await findByTestId('studio-pairing-result')).props.children).toBe('studio.pairing.error.expired');
  });

  it('sends a guest to sign in and back to this pairing', async () => {
    mockAuth.user = null;
    const { getByTestId } = render(<StudioPairingScreen />);
    fireEvent.press(getByTestId('studio-pairing-sign-in'));
    expect(mockRequireAuth).toHaveBeenCalledWith('/estudio/vincular/pairing-123', 'studio.pairing.signInReason');
    expect(inspect).not.toHaveBeenCalled();
  });
});
