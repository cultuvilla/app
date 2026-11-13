import * as ImagePicker from 'expo-image-picker';
import { pickAndCropSquare, recoverPickedSquare } from '../imageCrop';

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));

const launch = ImagePicker.launchImageLibraryAsync as jest.Mock;
const pending = ImagePicker.getPendingResultAsync as jest.Mock;

const ASSET = { uri: 'file:///tmp/pic.jpg', fileName: 'pic.jpg', mimeType: 'image/jpeg' };
const FAKE_BLOB = { size: 10, type: 'image/jpeg' } as unknown as Blob;

/** Stub XMLHttpRequest so uriToBlob (native reads the picked file via XHR, not
 * fetch — see lib/uriToBlob) resolves to FAKE_BLOB without touching the disk. */
function stubXhr() {
  const open = jest.fn();
  const send = jest.fn(function (this: { onload: () => void; response: Blob }) {
    this.response = FAKE_BLOB;
    this.onload();
  });
  // @ts-expect-error minimal XHR stand-in for the test
  global.XMLHttpRequest = jest.fn(() => ({
    open,
    send,
    set onload(fn: () => void) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      (this as { _onload?: () => void })._onload = fn;
    },
    get onload() {
      return (this as { _onload?: () => void })._onload!;
    },
    onerror: null,
    responseType: '',
    response: undefined,
  }));
  return { open };
}

describe('pickAndCropSquare (native)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    launch.mockReset();
  });

  it('opens the OS editor with a locked 1:1 aspect and maps the result', async () => {
    launch.mockResolvedValue({ canceled: false, assets: [ASSET] });
    const { open } = stubXhr();

    const result = await pickAndCropSquare();

    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ allowsEditing: true, aspect: [1, 1] }),
    );
    expect(open).toHaveBeenCalledWith('GET', ASSET.uri, true);
    // The pick is re-encoded before upload (lib/downscale.ts), so the object is
    // named after what was actually produced rather than the picker's filename.
    // expo-image-manipulator is unavailable in jest, which exercises the
    // fallback branch: the untouched asset, with its own content type.
    expect(result).toMatchObject({
      blob: FAKE_BLOB,
      contentType: 'image/jpeg',
      previewUri: ASSET.uri,
    });
    expect(result?.filename).toMatch(/^upload-\d+\.jpg$/);
  });

  it('returns null when the user cancels the picker/crop', async () => {
    launch.mockResolvedValue({ canceled: true, assets: [] });
    expect(await pickAndCropSquare()).toBeNull();
  });
});

describe('recoverPickedSquare (Android closed the app behind the picker)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    pending.mockReset();
  });

  it('maps the pick the closed app never received', async () => {
    pending.mockResolvedValue({ canceled: false, assets: [ASSET] });
    stubXhr();

    expect(await recoverPickedSquare()).toMatchObject({
      blob: FAKE_BLOB,
      contentType: 'image/jpeg',
      previewUri: ASSET.uri,
    });
  });

  it.each([
    ['nothing is pending', null],
    ['the pending pick was cancelled', { canceled: true, assets: null }],
    ['the pending pick failed', { code: 'ERR', message: 'boom' }],
  ])('returns null when %s', async (_label, result) => {
    pending.mockResolvedValue(result);
    expect(await recoverPickedSquare()).toBeNull();
  });
});
