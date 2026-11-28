import { getCrashlytics, log, recordError, setUserId } from '@react-native-firebase/crashlytics';
import { _resetNativeCrashlyticsForTests, createCrashlyticsBackend, toBreadcrumb } from '../crashlytics';

const mockGetCrashlytics = getCrashlytics as jest.Mock;
const mockLog = log as jest.Mock;
const mockRecordError = recordError as jest.Mock;
const mockSetUserId = setUserId as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCrashlytics.mockImplementation(() => ({}));
  _resetNativeCrashlyticsForTests();
});

describe('toBreadcrumb', () => {
  it('renders fields as a greppable suffix and skips empty ones', () => {
    expect(toBreadcrumb('warn', 'feed slow', { ms: 1200, route: '/x', none: undefined, nil: null })).toBe(
      '[warn] feed slow (ms=1200, route=/x)',
    );
  });

  it('serialises objects instead of printing [object Object]', () => {
    expect(toBreadcrumb('info', 'm', { ids: ['a', 'b'] })).toBe('[info] m (ids=["a","b"])');
  });

  it('has no suffix without fields', () => {
    expect(toBreadcrumb('info', 'boot', {})).toBe('[info] boot');
  });
});

describe('createCrashlyticsBackend', () => {
  it('records the error with its context as the line before it', () => {
    const error = new Error('boom');
    createCrashlyticsBackend().recordError(error, { route: '/village/abc', code: 'unavailable' });
    expect(mockLog).toHaveBeenCalledWith({}, '[error] boom (route=/village/abc, code=unavailable)');
    expect(mockRecordError).toHaveBeenCalledWith({}, error);
    expect(mockLog.mock.invocationCallOrder[0]).toBeLessThan(mockRecordError.mock.invocationCallOrder[0] ?? 0);
  });

  it('wraps a thrown non-Error so the report still has a stack', () => {
    createCrashlyticsBackend().recordError('plain string', {});
    const recorded = mockRecordError.mock.calls[0][1];
    expect(recorded).toBeInstanceOf(Error);
    expect(recorded.message).toBe('plain string');
  });

  it('writes structured logs as breadcrumbs', () => {
    createCrashlyticsBackend().log('info', 'opened', { surface: 'feed' });
    expect(mockLog).toHaveBeenCalledWith({}, '[info] opened (surface=feed)');
  });

  it('sets the hashed user id, and clears it on sign-out', () => {
    const backend = createCrashlyticsBackend();
    backend.setUserId('hash1');
    backend.setUserId(null);
    expect(mockSetUserId.mock.calls).toEqual([
      [{}, 'hash1'],
      [{}, ''],
    ]);
  });

  // A build without this env's native Firebase config has no default app.
  it('is a no-op when the native module cannot start', () => {
    mockGetCrashlytics.mockImplementation(() => {
      throw new Error('No Firebase App');
    });
    const backend = createCrashlyticsBackend();
    expect(() => {
      backend.recordError(new Error('boom'), {});
      backend.log('info', 'x', {});
      backend.setUserId('hash1');
    }).not.toThrow();
    expect(mockRecordError).not.toHaveBeenCalled();
  });

  it('never lets a native failure reach the caller', () => {
    mockRecordError.mockImplementation(() => {
      throw new Error('native');
    });
    mockSetUserId.mockImplementation(() => Promise.reject(new Error('native')));
    const backend = createCrashlyticsBackend();
    expect(() => backend.recordError(new Error('boom'), {})).not.toThrow();
    expect(() => backend.setUserId('hash1')).not.toThrow();
  });
});
