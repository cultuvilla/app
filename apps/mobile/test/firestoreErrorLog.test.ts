import { withFirestoreErrorLog } from '../lib/firestoreErrorLog';

jest.mock('@cultuvilla/shared/firebase', () => ({
  getAuth: () => ({ currentUser: { uid: 'test-uid' } }),
}));

/** A Firestore error as the native SDK throws it: the code carries a prefix. */
function firestoreError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code: `firestore/${code}` });
}

const mockCaptureError = jest.fn();
jest.mock('@cultuvilla/shared', () => ({
  observability: { captureError: (...a: unknown[]) => mockCaptureError(...a) },
}));

declare const globalThis: { __DEV__?: boolean } & typeof global;

describe('withFirestoreErrorLog', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    globalThis.__DEV__ = true;
    mockCaptureError.mockClear();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('returns the value when op resolves', async () => {
    const result = await withFirestoreErrorLog('test:ok', async () => 42);
    expect(result).toBe(42);
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs label/uid and rethrows on permission-denied', async () => {
    const err = firestoreError('permission-denied', 'Missing or insufficient permissions.');
    await expect(
      withFirestoreErrorLog('test:deny', async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0][0] as string;
    expect(line).toContain('[firestore-deny]');
    expect(line).toContain('label=test:deny');
    expect(line).toContain('uid=test-uid');
    expect(mockCaptureError).toHaveBeenCalledWith(err, { operation: 'test:deny' });
  });

  it('does not log for non-Firebase errors but still rethrows', async () => {
    const err = new Error('boom');
    await expect(
      withFirestoreErrorLog('test:other', async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(warn).not.toHaveBeenCalled();
  });

  // The label is the only thing that can name an otherwise opaque Firestore
  // denial, so production must report it even though it stays off the console.
  it('reports the label in production without writing to the console', async () => {
    globalThis.__DEV__ = false;
    const err = firestoreError('permission-denied', 'denied');
    await expect(
      withFirestoreErrorLog('test:prod', async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(warn).not.toHaveBeenCalled();
    expect(mockCaptureError).toHaveBeenCalledWith(err, { operation: 'test:prod' });
  });

  it('does not report errors that are not permission denials', async () => {
    globalThis.__DEV__ = false;
    const err = firestoreError('unavailable', 'offline');
    await expect(
      withFirestoreErrorLog('test:offline', async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
