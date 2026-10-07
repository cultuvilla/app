import * as ImageManipulator from 'expo-image-manipulator';
import { UPLOAD_MAX_EDGE, downscaleForUpload, resizeActionFor } from '../downscale';

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  manipulateAsync: jest.fn(),
}));

const manipulate = ImageManipulator.manipulateAsync as jest.Mock;

const RESULT = { uri: 'file:///tmp/out.webp', width: 1600, height: 1200 };

describe('resizeActionFor', () => {
  it('caps the long edge when the image is landscape', () => {
    expect(resizeActionFor(4000, 3000)).toEqual([{ resize: { width: UPLOAD_MAX_EDGE } }]);
  });

  it('caps the long edge when the image is portrait', () => {
    expect(resizeActionFor(3000, 4000)).toEqual([{ resize: { height: UPLOAD_MAX_EDGE } }]);
  });

  it('does not upscale an image already under the cap', () => {
    expect(resizeActionFor(800, 600)).toEqual([]);
  });

  it('does not resize an image exactly at the cap', () => {
    expect(resizeActionFor(UPLOAD_MAX_EDGE, 900)).toEqual([]);
  });

  it('treats unknown dimensions as needing no resize', () => {
    // expo-image-picker can report 0 for an asset it could not measure; asking
    // the manipulator to resize to 0 would produce an unusable image.
    expect(resizeActionFor(0, 0)).toEqual([]);
  });
});

describe('downscaleForUpload', () => {
  beforeEach(() => {
    manipulate.mockReset();
    manipulate.mockResolvedValue(RESULT);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('encodes to WebP on native', async () => {
    const out = await downscaleForUpload({ uri: 'file:///a.jpg', width: 4000, height: 3000 });

    expect(manipulate).toHaveBeenCalledWith(
      'file:///a.jpg',
      [{ resize: { width: UPLOAD_MAX_EDGE } }],
      expect.objectContaining({ format: 'webp' }),
    );
    expect(out).toEqual({
      uri: RESULT.uri,
      width: RESULT.width,
      height: RESULT.height,
      contentType: 'image/webp',
      extension: 'webp',
    });
  });

  it('still re-encodes an image under the size cap', async () => {
    // A 900x900 PNG can be several MB; the recompress is the point, not just
    // the resize. The action list is empty but the save options still apply.
    await downscaleForUpload({ uri: 'file:///a.png', width: 900, height: 900 });

    expect(manipulate).toHaveBeenCalledWith('file:///a.png', [], expect.anything());
  });

  it('falls back to the original asset when the manipulator throws', async () => {
    manipulate.mockRejectedValue(new Error('decode failed'));

    const out = await downscaleForUpload({
      uri: 'file:///a.heic',
      width: 4000,
      height: 3000,
      contentType: 'image/heic',
    });

    // An upload that is merely large beats an upload that fails outright.
    expect(out).toEqual({
      uri: 'file:///a.heic',
      width: 4000,
      height: 3000,
      contentType: 'image/heic',
      extension: 'heic',
    });
  });

  it('falls back to a jpeg extension when the original content type is unknown', async () => {
    manipulate.mockRejectedValue(new Error('nope'));

    const out = await downscaleForUpload({ uri: 'file:///a', width: 10, height: 10 });

    expect(out.contentType).toBe('image/jpeg');
    expect(out.extension).toBe('jpg');
  });
});
