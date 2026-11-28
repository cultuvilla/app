import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { VillageWrappedStrip } from '../VillageWrappedStrip';
import { getPublishedVillageWrapped, type VillageWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { partialOf } from '../../../../test/fakeModule';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/villageWrappedService', () =>
  jest
    .requireActual<typeof import('../../../../test/fakeModule')>('../../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/villageWrappedService')>(
      '@cultuvilla/shared/services/villageWrappedService',
    ),
);

const mockPublished = jest.mocked(getPublishedVillageWrapped);

function wrapped(year: number) {
  return partialOf<VillageWrapped>({
    id: `m1_${String(year)}`,
    year,
    images: { cover: 'https://x/cover.png', stats: 'https://x/stats.png' },
  });
}

beforeEach(() => jest.clearAllMocks());

describe('VillageWrappedStrip', () => {
  it('opens the newest published Wrapped from the village home', async () => {
    mockPublished.mockResolvedValue([wrapped(2026), wrapped(2025)]);
    const { findByTestId } = render(<VillageWrappedStrip municipalityId="m1" villageSlug="villa" />);
    fireEvent.press(await findByTestId('village-wrapped-strip'));
    expect(router.push).toHaveBeenCalledWith('/villa/fiestas/2026');
  });

  it('stays on the home however old the Wrapped is', async () => {
    mockPublished.mockResolvedValue([wrapped(2023)]);
    const { findByTestId } = render(<VillageWrappedStrip municipalityId="m1" villageSlug="villa" />);
    expect(await findByTestId('village-wrapped-strip')).toBeTruthy();
  });

  it('renders nothing without a published Wrapped', async () => {
    mockPublished.mockResolvedValue([]);
    const { queryByTestId } = render(<VillageWrappedStrip municipalityId="m1" villageSlug="villa" />);
    await waitFor(() => expect(mockPublished).toHaveBeenCalledWith('m1'));
    expect(queryByTestId('village-wrapped-strip')).toBeNull();
  });

  it('renders nothing when the read fails', async () => {
    mockPublished.mockRejectedValue(new Error('offline'));
    const { queryByTestId } = render(<VillageWrappedStrip municipalityId="m1" villageSlug="villa" />);
    await waitFor(() => expect(mockPublished).toHaveBeenCalled());
    expect(queryByTestId('village-wrapped-strip')).toBeNull();
  });
});
