// "[storage/unknown] bytes cannot be null" on every native image upload:
// RNFirebase's `put(blob, { contentType })` forwards the blob as an undecoded
// `data_url` whenever metadata names a contentType, and the Android uploader
// only decodes `base64`/`base64url`. The seam must hand native plain base64.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const uploadString = vi.fn();
const uploadBytesResumable = vi.fn();

vi.mock('@react-native-firebase/storage', () => ({
  uploadString,
  uploadBytesResumable,
  connectStorageEmulator: vi.fn(),
  getDownloadURL: vi.fn(),
  getStorage: vi.fn(),
  ref: vi.fn(),
}));

class FakeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

describe('native uploadBytes (bytes cannot be null on image upload)', () => {
  beforeEach(() => {
    vi.stubGlobal('FileReader', FakeFileReader);
    uploadString.mockReset().mockResolvedValue({ ref: 'r', metadata: { contentType: 'image/jpeg' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uploads a Blob as plain base64 with the caller metadata', async () => {
    const { uploadBytes } = await import('../../src/firebase/sdk/storage.native');
    const blob = new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' });
    const metadata = { contentType: 'image/jpeg', cacheControl: 'public' };

    const result = await uploadBytes('ref' as never, blob, metadata);

    expect(uploadBytesResumable).not.toHaveBeenCalled();
    expect(uploadString).toHaveBeenCalledWith('ref', Buffer.from([1, 2, 3, 250]).toString('base64'), 'base64', metadata);
    expect(result).toEqual({ ref: 'r', metadata: { contentType: 'image/jpeg' } });
  });
});
