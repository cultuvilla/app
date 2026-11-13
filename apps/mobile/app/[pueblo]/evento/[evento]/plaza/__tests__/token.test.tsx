import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ClaimSeatScreen from '../[token]';
import { claimEventSeat } from '@cultuvilla/shared/services/registrationService';
import { getEvent } from '@cultuvilla/shared/services/eventService';
import { patchUserProfile } from '@cultuvilla/shared/services/userService';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ pueblo: 'villa', evento: 'fiesta_ev1', token: 'tok1' }),
}));
jest.mock('../../../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
const mockAuth: { user: { uid: string } | null; profile: { telephone: string | null } | null; refreshProfile: jest.Mock } = {
  user: { uid: 'u1' },
  profile: null,
  refreshProfile: jest.fn(),
};
jest.mock('../../../../../../lib/auth/useAuth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../../../../../lib/auth/RegisterGateContext', () => ({
  useRegisterGate: () => ({ requireAuth: jest.fn() }),
}));
jest.mock('@cultuvilla/shared/services/eventService', () => ({
  getEvent: jest.fn().mockResolvedValue({
    id: 'ev1',
    title: 'Concurso de parejas',
    startDate: new Date('2026-08-15T18:00:00Z'),
    signupGroupSize: 2,
    telephoneRequired: true,
    signupFields: [],
  }),
}));
jest.mock('@cultuvilla/shared/services/personService', () => ({
  getPersonByUserId: jest.fn().mockResolvedValue({ id: 'p1', name: 'Ana', middleNames: [], surname1: 'García', surname2: null, nickname: null }),
}));
jest.mock('@cultuvilla/shared/services/registrationService', () => ({ claimEventSeat: jest.fn() }));
jest.mock('@cultuvilla/shared/services/userService', () => ({ patchUserProfile: jest.fn() }));

const mockClaim = claimEventSeat as jest.Mock;
const mockPatch = patchUserProfile as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.profile = null;
  mockPatch.mockResolvedValue(undefined);
});

describe('ClaimSeatScreen — phone', () => {
  it('prefills the saved phone and does not rewrite it when kept', async () => {
    mockAuth.profile = { telephone: '+34600111222' };
    mockClaim.mockResolvedValue(undefined);
    const { findByTestId, getByTestId } = render(<ClaimSeatScreen />);

    expect((await findByTestId('claim-phone')).props.value).toBe('600111222');
    fireEvent.press(getByTestId('claim-confirm'));

    await findByTestId('claim-success');
    expect(mockClaim).toHaveBeenCalledWith('ev1', 'tok1', expect.objectContaining({ phone: '+34600111222' }));
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('saves a newly typed phone to the profile only after the claim succeeds', async () => {
    let resolveClaim: () => void = () => {};
    mockClaim.mockReturnValue(new Promise<void>((r) => (resolveClaim = r)));
    const { findByTestId, getByTestId } = render(<ClaimSeatScreen />);

    fireEvent.changeText(await findByTestId('claim-phone'), '600333444');
    fireEvent.press(getByTestId('claim-confirm'));
    await waitFor(() => expect(mockClaim).toHaveBeenCalled());
    expect(mockPatch).not.toHaveBeenCalled();

    resolveClaim();
    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith('u1', { telephone: '+34600333444' }));
    await waitFor(() => expect(mockAuth.refreshProfile).toHaveBeenCalled());
  });

  it('does not save the phone when the claim fails', async () => {
    mockClaim.mockRejectedValue(new Error('taken'));
    const { findByTestId, getByTestId } = render(<ClaimSeatScreen />);

    fireEvent.changeText(await findByTestId('claim-phone'), '600333444');
    fireEvent.press(getByTestId('claim-confirm'));

    await findByTestId('claim-error');
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('never overwrites typed input with a profile that arrives late', async () => {
    const { findByTestId, getByTestId, rerender } = render(<ClaimSeatScreen />);
    fireEvent.changeText(await findByTestId('claim-phone'), '600333444');

    mockAuth.profile = { telephone: '+34600111222' };
    rerender(<ClaimSeatScreen />);

    expect(getByTestId('claim-phone').props.value).toBe('600333444');
  });
});

describe('ClaimSeatScreen — questions', () => {
  it("asks the event's questions and sends the answers with the claim", async () => {
    (getEvent as jest.Mock).mockResolvedValueOnce({
      id: 'ev1',
      title: 'Concurso de parejas',
      startDate: new Date('2026-08-15T18:00:00Z'),
      signupGroupSize: 2,
      telephoneRequired: false,
      signupFields: [{ id: 'talla', label: 'Talla', type: 'text', required: true, options: [] }],
    });
    mockClaim.mockResolvedValue(undefined);
    const { findByTestId, getByTestId } = render(<ClaimSeatScreen />);

    fireEvent.changeText(await findByTestId('claim-answer-talla'), 'M');
    fireEvent.press(getByTestId('claim-confirm'));

    await findByTestId('claim-success');
    expect(mockClaim).toHaveBeenCalledWith('ev1', 'tok1', expect.objectContaining({ answers: { talla: 'M' } }));
  });
});
