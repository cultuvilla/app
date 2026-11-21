import { Image } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import WrappedViewerScreen from '../fiestas/[year]';
import { getReadableWrapped } from '@cultuvilla/shared/services/villageWrappedService';
import { useWrappedShare } from '../../../lib/wrapped/useWrappedShare';
import { watchFiestaProgrammeEvents } from '@cultuvilla/shared/services/eventService';
import { saveFiestaEdition } from '@cultuvilla/shared/services/fiestaEditionService';
import { useVillageFiestas } from '../../../lib/fiestas/useVillageFiestas';
import { useAuth } from '../../../lib/auth/useAuth';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../../../lib/navigation/VillageRouteGate');
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../lib/wrapped/useWrappedShare', () => ({ useWrappedShare: jest.fn() }));
jest.mock('@cultuvilla/shared/services/villageWrappedService', () => ({ getReadableWrapped: jest.fn() }));
jest.mock('@cultuvilla/shared/services/eventService', () => ({ watchFiestaProgrammeEvents: jest.fn() }));
jest.mock('@cultuvilla/shared/services/fiestaEditionService', () => ({
  saveFiestaEdition: jest.fn(() => Promise.resolve('m1_carmen_2026')),
  deleteFiestaEdition: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../../lib/fiestas/useVillageFiestas', () => ({ useVillageFiestas: jest.fn() }));
jest.mock('../../../lib/auth/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../../../lib/auth/useEntityCapabilities', () => ({ useEntityCapabilities: jest.fn() }));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({
  getWrappedLink: (slug: string, year: number) => ({ path: `/${slug}/fiestas/${String(year)}` }),
}));
jest.mock('../../../lib/deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => mockShareDeepLink }));

const mockShareDeepLink = jest.fn(() => Promise.resolve());
const mockRead = getReadableWrapped as jest.Mock;
const mockFiestas = useVillageFiestas as jest.Mock;
const mockProgramme = watchFiestaProgrammeEvents as jest.Mock;
const mockAuth = useAuth as jest.Mock;
const mockCaps = useEntityCapabilities as jest.Mock;

const santiago = { id: 'santiago', name: 'Santiago', month: 7 };
const carmen = { id: 'carmen', name: 'Carmen', month: 8 };
const edition = {
  id: 'm1_santiago_2026',
  municipalityId: 'm1',
  villageSlug: 'villa',
  blockId: 'santiago',
  year: 2026,
  startDay: '2026-07-24',
  endDay: '2026-07-26',
  proposedBy: 'someone',
  createdAt: new Date(),
  updatedAt: new Date(),
  block: santiago,
};
const programmeEvent = (id: string, title: string, iso: string) => ({
  id,
  title,
  startDate: new Date(iso),
  location: { coordinates: { lat: 0, lng: 0 }, displayName: 'Plaza Mayor' },
  fiestaEditionId: 'm1_santiago_2026',
  villageSlug: 'villa',
  visibilityOrgId: null,
});
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
  mockFiestas.mockReturnValue({ fiestas: [], editions: [], status: 'ready', error: null });
  mockProgramme.mockImplementation((_ids: string[], next: (rows: unknown[]) => void) => {
    next([]);
    return () => undefined;
  });
  mockAuth.mockReturnValue({ user: null });
  mockCaps.mockReturnValue({ canManage: false, isMember: false });
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

describe('the programa de fiestas', () => {
  beforeEach(() => {
    mockRead.mockResolvedValue(null);
    mockFiestas.mockReturnValue({ fiestas: [santiago, carmen], editions: [edition], status: 'ready', error: null });
    mockProgramme.mockImplementation((ids: string[], next: (rows: unknown[]) => void) => {
      expect(ids).toEqual(['m1_santiago_2026']);
      next([
        programmeEvent('pregon', 'Pregón', '2026-07-24T18:00:00Z'),
        programmeEvent('misa', 'Misa', '2026-07-25T08:00:00Z'),
      ]);
      return () => undefined;
    });
  });

  it('shows the edition day by day to anyone, before the Wrapped exists', async () => {
    const { findByTestId, getByTestId, getByText, queryByTestId } = render(<WrappedViewerScreen />);
    expect(await findByTestId('fiesta-edition-santiago')).toBeTruthy();
    expect(getByTestId('fiesta-programme-day-2026-07-24')).toBeTruthy();
    expect(getByText('Pregón')).toBeTruthy();
    expect(getByText('Misa')).toBeTruthy();
    fireEvent.press(getByTestId('fiesta-programme-event-pregon'));
    expect(router.push).toHaveBeenCalledWith(expect.stringContaining('/villa/evento/'));
    // A visitor can read and forward it, but not date or correct it.
    expect(queryByTestId('fiesta-edition-edit-santiago')).toBeNull();
    expect(queryByTestId('fiesta-edition-add-carmen')).toBeNull();
    fireEvent.press(getByTestId('fiesta-programme-share'));
    expect(mockShareDeepLink).toHaveBeenCalledWith(expect.objectContaining({ path: '/villa/fiestas/2026' }), 'village.fiestas.programme.shareName');
  });

  it('lets a member date a block that has no days yet', async () => {
    mockAuth.mockReturnValue({ user: { uid: 'u1' } });
    mockCaps.mockReturnValue({ canManage: false, isMember: true });
    const { findByTestId, getByTestId, queryByTestId } = render(<WrappedViewerScreen />);
    fireEvent.press(await findByTestId('fiesta-edition-add-carmen'));
    expect(getByTestId('fiesta-edition-editor-carmen')).toBeTruthy();
    // Only the proposer or an admin corrects an edition.
    expect(queryByTestId('fiesta-edition-edit-santiago')).toBeNull();
    expect(saveFiestaEdition).not.toHaveBeenCalled();
  });

  it('says so when an edition has no events yet', async () => {
    mockProgramme.mockImplementation((_ids: string[], next: (rows: unknown[]) => void) => {
      next([]);
      return () => undefined;
    });
    const { findByTestId } = render(<WrappedViewerScreen />);
    expect(await findByTestId('fiesta-programme-empty-santiago')).toBeTruthy();
  });

  it('lets an admin correct the days', async () => {
    mockAuth.mockReturnValue({ user: { uid: 'boss' } });
    mockCaps.mockReturnValue({ canManage: true, isMember: true });
    const { findByTestId, getByTestId } = render(<WrappedViewerScreen />);
    fireEvent.press(await findByTestId('fiesta-edition-edit-santiago'));
    expect(getByTestId('fiesta-edition-editor-santiago')).toBeTruthy();
    expect(getByTestId('fiesta-edition-remove')).toBeTruthy();
  });

  it('opens a block’s editor from the village home’s invitation', async () => {
    mockParams.mockReturnValue({ year: '2026', fechas: 'carmen' });
    mockAuth.mockReturnValue({ user: { uid: 'u1' } });
    mockCaps.mockReturnValue({ canManage: false, isMember: true });
    const { findByTestId } = render(<WrappedViewerScreen />);
    expect(await findByTestId('fiesta-edition-editor-carmen')).toBeTruthy();
  });

  it('keeps the programme a tap away once the Wrapped is published', async () => {
    mockRead.mockResolvedValue(published);
    mockParams.mockReturnValue({ year: '2026', vista: 'programa' });
    const { findByTestId, getByTestId } = render(<WrappedViewerScreen />);
    expect(await findByTestId('fiesta-edition-santiago')).toBeTruthy();
    fireEvent.press(getByTestId('fiesta-programme-summary'));
    expect(await findByTestId('wrapped-story-card-cover')).toBeTruthy();
  });
});
