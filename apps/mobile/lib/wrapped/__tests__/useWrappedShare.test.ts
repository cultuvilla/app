import { renderHook, waitFor } from '@testing-library/react-native';
import { useWrappedShare } from '../useWrappedShare';
import { saveCardImage, shareCardImage } from '../shareCardImage';
import { showAlert } from '../../dialogs';

jest.mock('../shareCardImage', () => ({
  canShareCardImage: true,
  saveCardImage: jest.fn(),
  shareCardImage: jest.fn(),
}));
jest.mock('../../dialogs', () => ({ showAlert: jest.fn() }));
jest.mock('../../i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../deeplink/useShareDeepLink', () => ({ useShareDeepLink: () => jest.fn() }));
jest.mock('@cultuvilla/shared/services/deepLinkService', () => ({ getWrappedLink: jest.fn() }));

const mockSave = saveCardImage as jest.Mock;
const mockShare = shareCardImage as jest.Mock;
const card = { card: 'stats' as const, url: 'https://x/stats.png' };

function saveCard() {
  const { result } = renderHook(() => useWrappedShare({ villageSlug: 'villa', villageName: 'Villa', year: 2026 }));
  result.current.saveCard?.(card);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShare.mockResolvedValue(undefined);
});

describe('useWrappedShare saveCard', () => {
  it('saves the card under a readable name and says so', async () => {
    mockSave.mockResolvedValue('saved');
    saveCard();
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('village.wrapped.viewer.saved'));
    expect(mockSave).toHaveBeenCalledWith(card.url, 'villa-fiestas-2026-stats');
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('points to the settings when the user refused the permission', async () => {
    mockSave.mockResolvedValue('denied');
    saveCard();
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('village.wrapped.viewer.saveDenied'));
    expect(mockShare).not.toHaveBeenCalled();
  });

  it('says so when the card could not be saved', async () => {
    mockSave.mockRejectedValue(new Error('E_SAVE'));
    saveCard();
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith('village.wrapped.viewer.saveFailed'));
    expect(mockShare).not.toHaveBeenCalled();
  });
});
