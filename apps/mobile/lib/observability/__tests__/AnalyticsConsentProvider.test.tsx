import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { observability } from '@cultuvilla/shared';
import { saveUsageAnalyticsConsent, watchPrivacySettings } from '@cultuvilla/shared/services/userService';
import { AnalyticsConsentProvider, useAnalyticsConsent } from '../AnalyticsConsentProvider';

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

jest.mock('../../../components/feature/AnalyticsConsentSheet', () => {
  const { Text: RNText, View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AnalyticsConsentSheet: ({
      visible,
      onAnswer,
      onDismiss,
    }: {
      visible: boolean;
      onAnswer: (granted: boolean) => void;
      onDismiss: () => void;
    }) =>
      visible ? (
        <View testID="sheet">
          <RNText onPress={() => onAnswer(true)}>yes</RNText>
          <RNText onPress={() => onAnswer(false)}>no</RNText>
          <RNText onPress={onDismiss}>close</RNText>
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

beforeEach(() => {
  jest.clearAllMocks();
  emit = null;
  mockAuth = { user: { uid: 'uid-1' }, profile: { personId: 'p1' } };
  (saveUsageAnalyticsConsent as jest.Mock).mockResolvedValue(undefined);
});

describe('AnalyticsConsentProvider', () => {
  it('keeps analytics off for a guest and never reads anyone’s settings', () => {
    mockAuth = { user: null, profile: null };
    const { queryByTestId } = render(tree());
    expect(lastConsent()).toEqual({ analytics: false });
    expect(setConsent).not.toHaveBeenCalledWith({ analytics: true });
    expect(watchPrivacySettings).not.toHaveBeenCalled();
    expect(queryByTestId('sheet')).toBeNull();
  });

  it('keeps analytics off while the answer loads, and for an account never asked', () => {
    const { getByTestId } = render(tree());
    expect(lastConsent()).toEqual({ analytics: false });
    act(() => emit?.(null));
    expect(lastConsent()).toEqual({ analytics: false });
    expect(getByTestId('answer').props.children).toBe('null');
  });

  it('turns analytics on for a yes and off again for a no', () => {
    render(tree());
    act(() => emit?.(yes));
    expect(lastConsent()).toEqual({ analytics: true });
    act(() => emit?.(no));
    expect(lastConsent()).toEqual({ analytics: false });
  });

  it('turns analytics off when the account signs out', () => {
    const view = render(tree());
    act(() => emit?.(yes));
    expect(lastConsent()).toEqual({ analytics: true });
    mockAuth = { user: null, profile: null };
    view.rerender(tree());
    expect(lastConsent()).toEqual({ analytics: false });
    expect(mockUnwatch).toHaveBeenCalled();
  });

  it('asks an onboarded account that never answered, once, and stores the answer', async () => {
    const { getByTestId, getByText } = render(tree());
    act(() => emit?.(null));
    expect(getByTestId('sheet')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText('no'));
    });
    expect(saveUsageAnalyticsConsent).toHaveBeenCalledWith('uid-1', false);
  });

  it('never asks an account that already answered', () => {
    const { queryByTestId } = render(tree());
    act(() => emit?.(no));
    expect(queryByTestId('sheet')).toBeNull();
  });

  it('does not ask during onboarding — the form asks there', () => {
    mockAuth = { user: { uid: 'uid-1' }, profile: null };
    const { queryByTestId } = render(tree());
    act(() => emit?.(null));
    expect(queryByTestId('sheet')).toBeNull();
  });

  it('closing the sheet without answering stores nothing and hides it for the session', () => {
    const { getByText, queryByTestId } = render(tree());
    act(() => emit?.(null));
    fireEvent.press(getByText('close'));
    expect(queryByTestId('sheet')).toBeNull();
    expect(saveUsageAnalyticsConsent).not.toHaveBeenCalled();
    expect(lastConsent()).toEqual({ analytics: false });
  });
});
