import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { VillageWrappedBanner } from '../VillageWrappedBanner';
import { getPublishedVillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/villageWrappedService', () => ({ getPublishedVillageWrapped: jest.fn() }));

const mockPublished = getPublishedVillageWrapped as jest.Mock;
const DAY = 24 * 60 * 60 * 1000;

function wrapped(daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * DAY);
  return { id: 'm1_2026', year: 2026, rangeEnd: at, computedAt: at, images: { cover: 'https://x/cover.png' } };
}

beforeEach(() => jest.clearAllMocks());

describe('VillageWrappedBanner', () => {
  it('opens a recent Wrapped from the village home', async () => {
    mockPublished.mockResolvedValue([wrapped(10)]);
    const { findByTestId } = render(<VillageWrappedBanner municipalityId="m1" villageSlug="villa" />);
    fireEvent.press(await findByTestId('village-wrapped-banner'));
    expect(router.push).toHaveBeenCalledWith('/villa/fiestas/2026');
  });

  it('stays out of the way once the Wrapped is old news', async () => {
    mockPublished.mockResolvedValue([wrapped(120)]);
    const { queryByTestId } = render(<VillageWrappedBanner municipalityId="m1" villageSlug="villa" />);
    await waitFor(() => expect(mockPublished).toHaveBeenCalledWith('m1'));
    expect(queryByTestId('village-wrapped-banner')).toBeNull();
  });

  it('renders nothing when the read fails', async () => {
    mockPublished.mockRejectedValue(new Error('offline'));
    const { queryByTestId } = render(<VillageWrappedBanner municipalityId="m1" villageSlug="villa" />);
    await waitFor(() => expect(mockPublished).toHaveBeenCalled());
    expect(queryByTestId('village-wrapped-banner')).toBeNull();
  });
});
