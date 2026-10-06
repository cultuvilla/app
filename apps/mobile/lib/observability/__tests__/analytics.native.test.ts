import {
  getAnalytics,
  logEvent,
  setAnalyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/analytics';
import {
  _resetNativeAnalyticsForTests,
  createAnalyticsBackend,
  toNativeEventName,
  toNativeParams,
} from '../analytics';
import { OBSERVABILITY_EVENTS } from '@cultuvilla/shared';

const mockGetAnalytics = getAnalytics as jest.Mock;
const mockLogEvent = logEvent as jest.Mock;

// The same rule @react-native-firebase/analytics enforces with a throw.
const VALID_NATIVE_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAnalytics.mockImplementation(() => ({}));
  _resetNativeAnalyticsForTests();
});

describe('toNativeEventName', () => {
  it.each(Object.values(OBSERVABILITY_EVENTS))('makes %s a valid native GA4 name', (name) => {
    expect(toNativeEventName(name)).toMatch(VALID_NATIVE_NAME);
  });

  it('maps dots to underscores', () => {
    expect(toNativeEventName('event.signup.success')).toBe('event_signup_success');
  });
});

describe('toNativeParams', () => {
  it('keeps strings and numbers, maps booleans to 0/1, drops the rest', () => {
    expect(
      toNativeParams({ entityKind: 'event', resultCount: 3, viaInvite: true, other: false, x: null, o: {} }),
    ).toEqual({ entityKind: 'event', resultCount: 3, viaInvite: 1, other: 0 });
  });
});

describe('createAnalyticsBackend', () => {
  it('logs the native name with converted params and the user id', () => {
    createAnalyticsBackend().trackEvent('org.join.success', { viaInvite: true }, 'hash1');
    expect(mockLogEvent).toHaveBeenCalledWith({}, 'org_join_success', { viaInvite: 1, user_id: 'hash1' });
  });

  it('forwards consent and user id', () => {
    const b = createAnalyticsBackend();
    b.setConsent(true);
    b.setUserId('hash1');
    expect(setAnalyticsCollectionEnabled).toHaveBeenCalledWith({}, true);
    expect(setUserId).toHaveBeenCalledWith({}, 'hash1');
  });

  it('is a no-op when the build has no native Firebase app', () => {
    mockGetAnalytics.mockImplementation(() => {
      throw new Error("No Firebase App '[DEFAULT]' has been created");
    });
    const b = createAnalyticsBackend();
    expect(() => {
      b.trackEvent('village.join.success', { villageId: 'v1' }, 'hash1');
      b.setConsent(true);
      b.setUserId('hash1');
    }).not.toThrow();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it('survives a synchronous validation throw from the SDK', () => {
    mockLogEvent.mockImplementationOnce(() => {
      throw new Error('invalid event name');
    });
    expect(() => createAnalyticsBackend().trackEvent('x.y.z', {}, null)).not.toThrow();
  });
});
