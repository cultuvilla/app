import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { observability } from '@cultuvilla/shared';
import { saveUsageAnalyticsConsent, watchPrivacySettings } from '@cultuvilla/shared/services/userService';
import { AnalyticsConsentProvider, PAGE_SETTLE_MS, useAnalyticsConsent } from '../AnalyticsConsentProvider';
import { EMPTY_PROMPT_STATE, noteConsentPromptAction, type ConsentPromptState } from '../analyticsConsentPrompt';
import { readConsentPromptState, writeConsentPromptState } from '../consentPromptStore';

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

let mockPath = '/';
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));

let mockStored: ConsentPromptState = EMPTY_PROMPT_STATE;
jest.mock('../consentPromptStore', () => ({
  readConsentPromptState: jest.fn(() => Promise.resolve(mockStored)),
  writeConsentPromptState: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../components/feature/AnalyticsConsentPage', () => {
  const { Text: RNText, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AnalyticsConsentPage: ({
      visible,
      onAnswer,
      onDismiss,
    }: {
      visible: boolean;
      onAnswer: (granted: boolean) => void;
      onDismiss: () => void;
    }) =>
      visible ? (
        <View testID="analytics-consent-page">
          <RNText onPress={() => onAnswer(true)}>yes</RNText>
          <RNText onPress={() => onAnswer(false)}>no</RNText>
          <RNText onPress={onDismiss}>back</RNText>
        </View>
      ) : null,
  };
});

const setConsent = observability.setConsent as jest.Mock;
const lastConsent = () => setConsent.mock.calls.at(-1)?.[0];
const yes = { usageAnalytics: true, updatedAt: new Date(0) };
const no = { usageAnalytics: false, updatedAt: new Date(0) };
const lastWritten = () => (writeConsentPromptState as jest.Mock).mock.calls.at(-1)?.[1] as ConsentPromptState;

function Probe() {
  const { answer } = useAnalyticsConsent();
  return <Text testID="answer">{String(answer)}</Text>;
}
const tree = () => (
  <AnalyticsConsentProvider>
    <Probe />
  </AnalyticsConsentProvider>
);

/** Renders, lets the stored prompt state load, and emits the account's answer. */
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
  mockPath = '/';
  mockStored = EMPTY_PROMPT_STATE;
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
    expect(readConsentPromptState).not.toHaveBeenCalled();
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
  it('counts today as an app day for the signed-in account', async () => {
    await mount();
    expect(lastWritten().days).toEqual(['2026-11-20']);
  });

  it('asks nobody on their first days who has done nothing yet', async () => {
    const { queryByTestId } = await mount();
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it('asks on the third distinct day', async () => {
    mockStored = { ...EMPTY_PROMPT_STATE, days: ['2026-11-17', '2026-11-18'] };
    const { getByTestId } = await mount();
    settle();
    expect(getByTestId('analytics-consent-page')).toBeTruthy();
  });

  it('after a first action, waits until the user is on another, ordinary screen', async () => {
    mockPath = '/aldea/evento/fiesta_1';
    const view = await mount();
    act(() => noteConsentPromptAction('event-signup'));
    expect(lastWritten().acted).toBe(true);
    settle();
    expect(view.queryByTestId('analytics-consent-page')).toBeNull();

    mockPath = '/crear/evento';
    view.rerender(tree());
    settle();
    expect(view.queryByTestId('analytics-consent-page')).toBeNull();

    mockPath = '/aldea';
    view.rerender(tree());
    settle();
    expect(view.getByTestId('analytics-consent-page')).toBeTruthy();
  });

  it('never asks during onboarding', async () => {
    mockAuth = { user: { uid: 'uid-1' }, profile: null };
    mockStored = { ...EMPTY_PROMPT_STATE, days: ['2026-11-17', '2026-11-18'], acted: true };
    const { queryByTestId } = await mount();
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it('never asks an account that already answered', async () => {
    mockStored = { ...EMPTY_PROMPT_STATE, days: ['2026-11-17', '2026-11-18'], acted: true };
    const { queryByTestId } = await mount(no);
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it.each([
    ['yes', true],
    ['no', false],
  ])('«%s» stores the answer and closes the page', async (label, stored) => {
    mockStored = { ...EMPTY_PROMPT_STATE, acted: true };
    const { getByText, queryByTestId } = await mount();
    settle();
    await act(async () => {
      fireEvent.press(getByText(label));
    });
    expect(saveUsageAnalyticsConsent).toHaveBeenCalledWith('uid-1', stored);
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it('Android back stores nothing, counts one unanswered close and leaves it for another day', async () => {
    mockStored = { ...EMPTY_PROMPT_STATE, acted: true };
    const { getByText, queryByTestId } = await mount();
    settle();
    fireEvent.press(getByText('back'));
    expect(queryByTestId('analytics-consent-page')).toBeNull();
    expect(saveUsageAnalyticsConsent).not.toHaveBeenCalled();
    expect(lastConsent()).toEqual({ analytics: false });
    expect(lastWritten()).toMatchObject({ closes: 1, lastClosedOn: '2026-11-20' });
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });

  it('after two unanswered closes never asks again', async () => {
    mockStored = { days: ['2026-11-17', '2026-11-18', '2026-11-19'], acted: true, closes: 2, lastClosedOn: '2026-11-19' };
    const { queryByTestId } = await mount();
    settle();
    expect(queryByTestId('analytics-consent-page')).toBeNull();
  });
});
