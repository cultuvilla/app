import { Text } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resolveVillageRoute } from '@cultuvilla/shared/services/municipalityService';
import { VillageRouteGate, useVillageRoute } from '../VillageRouteGate';

const mockParams: Record<string, string> = { pueblo: 'matabuena' };
const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => false), replace: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  get router() {
    return mockRouter;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({
  resolveVillageRoute: jest.fn(),
}));
jest.mock('../../i18n', () => ({ useT: () => ({ locale: 'es', t: (key: string) => key }) }));

const resolve = resolveVillageRoute as jest.Mock;

function Probe() {
  const { municipalityId, slug, name } = useVillageRoute();
  return <Text>{`${slug}:${municipalityId}:${name}`}</Text>;
}

function renderGate() {
  return render(
    <VillageRouteGate>
      <Probe />
    </VillageRouteGate>,
  );
}

describe('VillageRouteGate', () => {
  beforeEach(() => {
    resolve.mockReset();
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(false);
  });

  it('renders the screen with the municipality behind the slug', async () => {
    resolve.mockResolvedValue({ id: 'm42', name: 'Matabuena' });
    const { findByText } = renderGate();
    expect(await findByText('matabuena:m42:Matabuena')).toBeTruthy();
    expect(resolve).toHaveBeenCalledWith('matabuena');
  });

  it('holds the screen back until the slug resolves', () => {
    resolve.mockReturnValue(new Promise(() => {}));
    const { queryByText } = renderGate();
    expect(queryByText(/matabuena:/)).toBeNull();
  });

  // A mistyped or unknown pueblo must say so, not spin forever or render a
  // screen with no village behind it.
  it('says the pueblo was not found when no village has the slug', async () => {
    resolve.mockResolvedValue(null);
    const { findByText, queryByText } = renderGate();
    expect(await findByText('village.notFound')).toBeTruthy();
    expect(queryByText(/matabuena:/)).toBeNull();
  });

  it('shows a retryable error when the lookup fails', async () => {
    resolve.mockRejectedValue(new Error('offline'));
    const { findByText } = renderGate();
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    expect(await findByText('common.error.retry')).toBeTruthy();
  });

  // QA 2026-11-18: a cold-start link to an unknown pueblo left the user on a
  // bare message with no header, so iOS (no hardware back) had no way out.
  it('offers a back button that goes home when an unknown pueblo is opened cold', async () => {
    resolve.mockResolvedValue(null);
    const { findByText, getByLabelText } = renderGate();
    await findByText('village.notFound');
    fireEvent.press(getByLabelText('header.back'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('goes back when there is history to return to', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    resolve.mockResolvedValue(null);
    const { findByText, getByLabelText } = renderGate();
    await findByText('village.notFound');
    fireEvent.press(getByLabelText('header.back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('keeps the back button on the retryable error too', async () => {
    resolve.mockRejectedValue(new Error('offline'));
    const { findByText, getByLabelText } = renderGate();
    await findByText('common.error.retry');
    expect(getByLabelText('header.back')).toBeTruthy();
  });
});
