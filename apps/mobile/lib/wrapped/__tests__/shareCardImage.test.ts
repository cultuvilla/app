import { shareCardImage } from '../shareCardImage';

const mockDownload = jest.fn();
const mockDelete = jest.fn();
const mockShareAsync = jest.fn<Promise<void>, [string, Record<string, unknown>?]>();
const mockIsAvailableAsync = jest.fn<Promise<boolean>, []>();
const mockExisting = { value: false };

jest.mock('expo-file-system', () => ({
  get File() {
    return class MockFile {
      static downloadFileAsync = (...args: unknown[]) => mockDownload(...args);
      name: string;
      constructor(_dir: unknown, mockFileName: string) {
        this.name = mockFileName;
      }
      get exists() {
        return mockExisting.value;
      }
      delete() {
        mockDelete(this.name);
      }
    };
  },
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockIsAvailableAsync(),
  shareAsync: (...args: [string, Record<string, unknown>?]) => mockShareAsync(...args),
}));

const URL_JPG = 'https://firebasestorage.googleapis.com/v0/b/x/o/villageWrapped%2Fm_2026%2Fevents.jpg?alt=media&token=t';
const URL_PNG = 'https://firebasestorage.googleapis.com/v0/b/x/o/villageWrapped%2Fm_2026%2Fstats.png?alt=media&token=t';

beforeEach(() => {
  jest.clearAllMocks();
  mockExisting.value = false;
  mockIsAvailableAsync.mockResolvedValue(true);
  mockShareAsync.mockResolvedValue(undefined);
  mockDownload.mockImplementation((_url: string, file: { name: string }) =>
    Promise.resolve({ uri: `file:///cache/${file.name}` }),
  );
});

describe('shareCardImage', () => {
  // An app handed a URL posts a link; handed the file, it posts the picture.
  it('downloads the card and shares the file, not the URL', async () => {
    await shareCardImage(URL_JPG, 'villa-fiestas-2026-events');

    expect(mockDownload).toHaveBeenCalledWith(URL_JPG, expect.objectContaining({ name: 'villa-fiestas-2026-events.jpg' }));
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/villa-fiestas-2026-events.jpg',
      expect.objectContaining({ mimeType: 'image/jpeg', UTI: 'public.jpeg' }),
    );
  });

  it('names a PNG card as one', async () => {
    await shareCardImage(URL_PNG, 'villa-fiestas-2026-stats');
    expect(mockShareAsync).toHaveBeenCalledWith(
      'file:///cache/villa-fiestas-2026-stats.png',
      expect.objectContaining({ mimeType: 'image/png', UTI: 'public.png' }),
    );
  });

  it('replaces the copy left by sharing the same card before', async () => {
    mockExisting.value = true;
    await shareCardImage(URL_PNG, 'villa-fiestas-2026-stats');
    expect(mockDelete).toHaveBeenCalledWith('villa-fiestas-2026-stats.png');
  });

  it('fails without a share sheet to hand the card to', async () => {
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(shareCardImage(URL_PNG, 'x')).rejects.toThrow(/not available/);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
