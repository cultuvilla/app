import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { observability } from '@cultuvilla/shared';
import { saveUsageAnalyticsConsent, watchPrivacySettings } from '@cultuvilla/shared/services/userService';
import { AnalyticsConsentProvider, PAGE_SETTLE_MS, useAnalyticsConsent } from '../AnalyticsConsentProvider';

jest.mock('@cultuvilla/shared', () => ({
  observability: { setConsent: jest.fn(), captureError: jest.fn() },
}));

type Row = { usageAnalytics: boolean; updatedAt: Date } | null;
let emit: ((row: Row) => void) | null = null;
const mockUnwatch = jest.fn();
jest.mock('@cultuvilla/shared/services/userService', () => ({
  watchPrivacySettings: jest.fn((_uid: string, onNext: (row: Row) => void) => {
    emit = onNext;
    return mockUnwatch;
  }),
  saveUsageAnalyticsConsent: jest.fn(),
}));

let mockAuth: { user: { uid: string } | null; profile: { personId: string | null } | null };
jest.mock('../../auth/useAuth', () => ({ useAuth: () => mockAuth }));

jest.mock('../../../components/feature/AnalyticsConsentPage', () => {
  const { Text: RNText, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AnalyticsConsentPage: ({
      visible,
      onAnswer,
    }: {
      visible: boolean;
      onAnswer: (granted: boolean) => void;
    }) =>
      visible ? (
        <View testID="analytics-consent-page">
          <RNText onPress={() => onAnswer(true)}>yes</RNText>
          <RNText onPress={() => onAnswer(false)}>no</RNText>
        </View>
      ) : null,
  };
});

const setConsent = observability.setConsent as jest.Mock;
const lastConsent = () => setConsent.mock.calls.at(-1)?.[0];
const yes = { usageAnalytics: true, updatedAt: new Date(0) };
const no = { usageAnalytics: false, updatedAt: new Date(0) };

function Probe() {
  const { answer } = useAnalyticsConsent();
  return <Text testID="answer">{String(answer)}</Text>;
}
const tree = () => (
  <AnalyticsConsentProvider>
    <Probe />
  </AnalyticsConsentProvider>
);

/** Renders and emits the account's stored answer. */
async function mount(row: Row = null) {
  const view = render(tree());
  await act(async () => {
    await Promise.resolve();
  });
  act(() => emit?.(row));
  return view;
}
const settle = () =>
  act(() => {
    jest.advanceTimersByTime(PAGE_SETTLE_MS);
  });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 10, 20, 12));
  jest.clearAllMocks();
  emit = null;
  mockAuth = { user: { uid: 'uid-1' }, profile: { personId: 'p1' } };
  (saveUsageAnalyticsConsent as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AnalyticsConsentProvider — consent', () => {
  it('keeps analytics off for a guest and never reads anyone’s settings', () => {
    mockAuth = { user: null, profile: null };
    const { queryByTestId } = render(tree());
    expect(lastConsent()).toEqual({ analytics: false });
    expect(setConsent).not.toHaveBeenCalledWith({ analytics: true });
    expect(watchPrivacySettings).not.toHaveBeenCalled();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it('keeps analytics off while the answer loads, and for an account never asked', async () => {
    const { getByTestId } = render(tree());
    expect(lastConsent()).toEqual({ analytics: false });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => emit?.(null));
    expect(lastConsent()).toEqual({ analytics: false });
    expect(getByTestId('answer').props.children).toBe('null');
  });

  it('turns analytics on for a yes and off again for a no', async () => {
    await mount(yes);
    expect(lastConsent()).toEqual({ analytics: true });
    act(() => emit?.(no));
    expect(lastConsent()).toEqual({ analytics: false });
  });

  it('turns analytics off when the account signs out', async () => {
    const view = await mount(yes);
    expect(lastConsent()).toEqual({ analytics: true });
    mockAuth = { user: null, profile: null };
    view.rerender(tree());
    expect(lastConsent()).toEqual({ analytics: false });
    expect(mockUnwatch).toHaveBeenCalled();
  });
});

describe('AnalyticsConsentProvider — when the page asks', () => {
  it('asks an onboarded account that never answered as soon as the app opens', async () => {
    const { getByTestId, queryByTestId } = await mount();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
    settle();
    expect(getByTestId('analytics-consent-page')).toBeTruthy();
  });

  it('never asks during onboarding, and asks once it is done', async () => {
    mockAuth = { user: { uid: 'uid-1' }, profile: null };
    const view = await mount();
    settle();
    expect(view.queryByTestId('analytics-consent-page')).toBeNull();
    mockAuth = { user: { uid: 'uid-1' }, profile: { personId: 'p1' } };
    view.rerender(tree());
    settle();
    expect(view.getByTestId('analytics-consent-page')).toBeTruthy();
  });

  it('never asks a guest or an account that already answered', async () => {
    const { queryByTestId } = await mount(no);
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it.each([
    ['yes', true],
    ['no', false],
  ])('«%s» stores the answer and closes the page', async (label, stored) => {
    const { getByText, queryByTestId } = await mount();
    settle();
    await act(async () => {
      fireEvent.press(getByText(label));
    });
    expect(saveUsageAnalyticsConsent).toHaveBeenCalledWith('uid-1', stored);
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it('stays closed after an answer even before the stored row comes back', async () => {
    const { getByText, queryByTestId } = await mount();
    settle();
    await act(async () => {
      fireEvent.press(getByText('no'));
    });
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });
});
