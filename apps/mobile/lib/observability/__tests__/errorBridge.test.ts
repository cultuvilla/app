import { fetchUserIdHash, __resetHashCacheForTest } from '../errorBridge';

const mockCallable = jest.fn();
jest.mock('@cultuvilla/shared/firebase/sdk/functions', () => ({ httpsCallable: () => mockCallable }));
jest.mock('@cultuvilla/shared/firebase', () => ({ getFirebaseFunctions: () => ({}) }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    },
  };
});

describe('fetchUserIdHash', () => {
  beforeEach(() => { mockCallable.mockReset(); __resetHashCacheForTest(); });

  it('calls the mockCallable once then serves from cache', async () => {
    mockCallable.mockResolvedValue({ data: { hash: 'abc123' } });
    expect(await fetchUserIdHash('u1')).toBe('abc123');
    expect(await fetchUserIdHash('u1')).toBe('abc123');
    expect(mockCallable).toHaveBeenCalledTimes(1);
  });

  it('returns null (never throws) when the mockCallable rejects', async () => {
    mockCallable.mockRejectedValue(new Error('offline'));
    expect(await fetchUserIdHash('u2')).toBeNull();
  });
});
