import { observability } from '@cultuvilla/shared';
import { reportWatchError, reportWatchStall, withFirestoreErrorLog } from '../firestoreErrorLog';

jest.mock('@cultuvilla/shared', () => ({ observability: { captureError: jest.fn() } }));
jest.mock('@cultuvilla/shared/firebase', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('@cultuvilla/shared/firebase/sdk/errors', () => ({
  firebaseErrorCode: (e: { code?: string }) => e.code?.replace(/^firestore\//, ''),
}));

const capture = observability.captureError as jest.Mock;
const fail = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => capture.mockClear());

describe('firestoreErrorLog', () => {
  it('reports only permission-denied from a one-off read', async () => {
    await expect(withFirestoreErrorLog('x:get', () => Promise.reject(fail('unavailable')))).rejects.toThrow();
    expect(capture).not.toHaveBeenCalled();
    await expect(withFirestoreErrorLog('x:get', () => Promise.reject(fail('permission-denied')))).rejects.toThrow();
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { operation: 'x:get' });
  });

  it('reports every code from a listener, a denial under its plain label', () => {
    reportWatchError('feed:watch', fail('firestore/permission-denied'));
    expect(capture).toHaveBeenLastCalledWith(expect.any(Error), { operation: 'feed:watch' });
    reportWatchError('feed:watch', fail('failed-precondition'));
    expect(capture).toHaveBeenLastCalledWith(expect.any(Error), { operation: 'feed:watch', surface: 'watch' });
  });

  it('names the stalled listener and how long it waited', () => {
    reportWatchStall('feed:watchAllVillagesFeed', 20_000);
    const [err, ctx] = capture.mock.calls[0] as [Error, Record<string, unknown>];
    expect(err.message).toBe('feed:watchAllVillagesFeed gave no answer in 20 s');
    expect(ctx).toEqual({ operation: 'feed:watchAllVillagesFeed', surface: 'watch-stall' });
  });
});
