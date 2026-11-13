import { render, fireEvent, waitFor } from '@testing-library/react-native';
import WrappedScreen from '../resumen';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { useLocalSearchParams } from 'expo-router';
import { madridYear } from '@cultuvilla/shared/models';
import {
  buildVillageWrapped,
  getVillageWrappedForYear,
  respondToVillageWrapped,
} from '@cultuvilla/shared/services/villageWrappedService';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>REDIRECT:{href}</Text>;
  },
}));
jest.mock('../../../lib/navigation/VillageRouteGate');
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/wrapped/useWrappedShare', () => ({
  useWrappedShare: () => ({ shareLink: jest.fn(), shareCard: jest.fn() }),
}));
jest.mock('../../../lib/useCallable', () => ({
  useCallable: ({ callable, onSuccess }: { callable: (...a: unknown[]) => Promise<unknown>; onSuccess?: () => unknown }) => ({
    isPending: false,
    fire: async (...args: unknown[]) => {
      const r = await callable(...args);
      await onSuccess?.();
      return r;
    },
  }),
}));
jest.mock('@cultuvilla/shared/services/municipalityService', () => ({ getMunicipality: jest.fn() }));
jest.mock('@cultuvilla/shared/services/villageWrappedService', () => ({
  getVillageWrappedForYear: jest.fn(),
  buildVillageWrapped: jest.fn(),
  respondToVillageWrapped: jest.fn(),
}));

const mockCaps = useEntityCapabilities as jest.Mock;
const mockMunicipality = getMunicipality as jest.Mock;
const mockWrapped = getVillageWrappedForYear as jest.Mock;

const village = { name: 'Matabuena', community: { fiestas: [{ id: 'carmen', name: 'Carmen', month: 1 }] } };

beforeEach(() => {
  jest.clearAllMocks();
  mockCaps.mockReturnValue({ canManage: true, loading: false });
  mockMunicipality.mockResolvedValue(village);
  mockWrapped.mockResolvedValue(null);
});

describe('WrappedScreen', () => {
  it('redirects a villager back to the village', () => {
    mockCaps.mockReturnValue({ canManage: false, loading: false });
    const { getByText } = render(<WrappedScreen />);
    expect(getByText('REDIRECT:/villa')).toBeTruthy();
    expect(getVillageWrappedForYear).not.toHaveBeenCalled();
  });

  it('shows the create form with the village fiestas and nothing to send yet', async () => {
    const { findByTestId, getByTestId } = render(<WrappedScreen />);
    expect(await findByTestId('wrapped-block-carmen-range')).toBeTruthy();
    expect(getByTestId('wrapped-submit').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('points a village without fiestas to add them', async () => {
    mockMunicipality.mockResolvedValue({ ...village, community: { fiestas: [] } });
    const { findByText, getByTestId } = render(<WrappedScreen />);
    expect(await findByText('village.wrapped.noFiestas')).toBeTruthy();
    expect(getByTestId('wrapped-go-fiestas')).toBeTruthy();
  });

  it('shows a built draft and publishes it', async () => {
    mockWrapped.mockResolvedValue({
      id: 'm1_2026',
      status: 'draft',
      autoPublishAt: new Date(),
      images: { cover: 'https://x/cover.png', stats: 'https://x/stats.png' },
      blocks: [{ blockId: 'carmen', name: 'Carmen', start: new Date('2026-01-02T00:00:00+01:00'), end: new Date('2026-01-03T23:59:59+01:00') }],
      rangeStart: new Date('2026-01-02T00:00:00+01:00'),
      rangeEnd: new Date('2026-01-03T23:59:59+01:00'),
    });
    const { findByTestId, getByTestId, queryByTestId } = render(<WrappedScreen />);
    expect(await findByTestId('wrapped-card-cover')).toBeTruthy();
    expect(queryByTestId('wrapped-card-news')).toBeNull();
    fireEvent.press(getByTestId('wrapped-publish'));
    await waitFor(() => expect(respondToVillageWrapped).toHaveBeenCalledWith('m1_2026', 'publish'));
    expect(buildVillageWrapped).not.toHaveBeenCalled();
  });

  // A village that has never built a Wrapped has no doc to read, and the rules
  // deny a read of a missing one rather than returning null. Whatever the read
  // fails for, the screen must say so -- it used to leave `fiestas` null and
  // spin forever, which is what an admin of a fresh village always saw.
  // A January reminder is about December's fiestas: last year's Wrapped.
  it('opens the year a reminder names', async () => {
    const lastYear = madridYear(new Date()) - 1;
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ year: String(lastYear) });
    render(<WrappedScreen />);
    await waitFor(() => expect(getVillageWrappedForYear).toHaveBeenCalledWith('m1', lastYear));
  });

  it('never opens a year that has not happened', async () => {
    const thisYear = madridYear(new Date());
    (useLocalSearchParams as jest.Mock).mockReturnValueOnce({ year: String(thisYear + 1) });
    render(<WrappedScreen />);
    await waitFor(() => expect(getVillageWrappedForYear).toHaveBeenCalledWith('m1', thisYear));
  });

  it('surfaces a failed load instead of spinning forever', async () => {
    mockWrapped.mockRejectedValue(new Error('permission-denied'));
    const { findByText, queryByText } = render(<WrappedScreen />);
    expect(await findByText('common.error.retry')).toBeTruthy();
    expect(queryByText('village.wrapped.noFiestas')).toBeNull();
  });

  it('opens the form prefilled from the built dates to regenerate', async () => {
    mockWrapped.mockResolvedValue({
      id: 'm1_2026',
      status: 'published',
      autoPublishAt: null,
      images: { cover: 'https://x/cover.png' },
      blocks: [{ blockId: 'carmen', name: 'Carmen', start: new Date('2026-01-01T23:00:00Z'), end: new Date('2026-01-03T22:59:59.999Z') }],
      rangeStart: new Date('2026-01-01T23:00:00Z'),
      rangeEnd: new Date('2026-01-03T22:59:59.999Z'),
    });
    const { findByTestId, getByTestId, getByText } = render(<WrappedScreen />);
    fireEvent.press(await findByTestId('wrapped-edit'));
    expect(getByTestId('wrapped-block-carmen-range')).toBeTruthy();
    expect(getByText('village.wrapped.submitRegenerate')).toBeTruthy();
  });
});
