import { Image } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import WrappedViewerScreen from '../fiestas/[year]';
import { getReadableWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { useWrappedShare } from '../../../lib/wrapped/useWrappedShare';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../../../lib/navigation/VillageRouteGate');
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/wrapped/useWrappedShare', () => ({ useWrappedShare: jest.fn() }));
jest.mock('@cultuvilla/shared/services/villageWrappedService', () => ({ getReadableWrapped: jest.fn() }));

const mockRead = getReadableWrapped as jest.Mock;
const mockParams = useLocalSearchParams as jest.Mock;
const shareLink = jest.fn();
const shareCard = jest.fn();
const saveCard = jest.fn();

const published = {
  id: 'm1_2026',
  status: 'published',
  year: 2026,
  villageName: 'Villa',
  images: { cover: 'https://x/cover.png', stats: 'https://x/stats.png' },
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  mockParams.mockReturnValue({ year: '2026' });
  (useWrappedShare as jest.Mock).mockReturnValue({ shareLink, shareCard, saveCard });
});

describe('the public Wrapped screen', () => {
  it('opens the published Wrapped as a story, with sharing', async () => {
    mockRead.mockResolvedValue(published);
    const { findByTestId, getByTestId } = render(<WrappedViewerScreen />);

    expect(await findByTestId('wrapped-story-card-cover')).toBeTruthy();
    expect(mockRead).toHaveBeenCalledWith('m1', 2026);
    fireEvent.press(getByTestId('wrapped-share-card'));
    expect(shareCard).toHaveBeenCalledWith({ card: 'cover', url: published.images.cover });
    fireEvent.press(getByTestId('wrapped-save-card'));
    expect(saveCard).toHaveBeenCalledWith({ card: 'cover', url: published.images.cover });
  });

  it('says so when there is no published Wrapped for that year', async () => {
    mockRead.mockResolvedValue(null);
    const { findByTestId, getByTestId } = render(<WrappedViewerScreen />);
    expect(await findByTestId('wrapped-missing')).toBeTruthy();
    fireEvent.press(getByTestId('wrapped-missing-village'));
    expect(router.replace).toHaveBeenCalledWith('/villa');
  });

  it('does not read anything for a year that is not one', async () => {
    mockParams.mockReturnValue({ year: 'agosto' });
    const { findByTestId } = render(<WrappedViewerScreen />);
    expect(await findByTestId('wrapped-missing')).toBeTruthy();
    expect(mockRead).not.toHaveBeenCalled();
  });

  it('offers a retry when the read fails', async () => {
    mockRead.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(published);
    const { findByText, findByTestId } = render(<WrappedViewerScreen />);
    fireEvent.press(await findByText('common.error.retry'));
    expect(await findByTestId('wrapped-story-card-cover')).toBeTruthy();
  });

  // A shared link opened cold has no history to go back to.
  it('closes to the village when there is nothing to go back to', async () => {
    mockRead.mockResolvedValue(published);
    const { findByTestId } = render(<WrappedViewerScreen />);
    fireEvent.press(await findByTestId('wrapped-story-close'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/villa'));
  });
});
