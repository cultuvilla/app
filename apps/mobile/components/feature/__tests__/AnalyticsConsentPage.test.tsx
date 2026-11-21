import { act, fireEvent, render } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AnalyticsConsentPage, STATUS_BAR_LEAD_MS } from '../AnalyticsConsentPage';
import { I18nProvider } from '../../../lib/i18n';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const setup = () => {
  const onAnswer = jest.fn();
  const view = render(
    <I18nProvider>
      <AnalyticsConsentPage visible onAnswer={onAnswer} />
    </I18nProvider>,
  );
  act(() => jest.advanceTimersByTime(STATUS_BAR_LEAD_MS));
  return { ...view, onAnswer };
};

describe('AnalyticsConsentPage', () => {
  it('shows the question, the lead and the small print over the drawing', () => {
    const { getByText, getByTestId } = setup();
    expect(getByTestId('analytics-consent-page')).toBeTruthy();
    expect(getByTestId('analytics-consent-illustration', { includeHiddenElements: true })).toBeTruthy();
    expect(getByText('¿Nos ayudas a mejorar Cultuvilla?')).toBeTruthy();
    expect(getByText(/qué pantallas se usan/)).toBeTruthy();
    expect(getByText(/Ajustes → Privacidad/)).toBeTruthy();
  });

  it('«Sí, claro» answers yes and «No, gracias» answers no', () => {
    const { getByTestId, getByText, onAnswer } = setup();
    expect(getByText('Sí, claro')).toBeTruthy();
    expect(getByText('No, gracias')).toBeTruthy();
    fireEvent.press(getByTestId('analytics-consent-yes'));
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    fireEvent.press(getByTestId('analytics-consent-no'));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
  });

  it('Android back does nothing — only an answer closes it', () => {
    const { UNSAFE_getByType, onAnswer, getByTestId } = setup();
    UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(getByTestId('analytics-consent-page')).toBeTruthy();
  });

  // QA 2026-11-21: white status-bar icons on the cream page. The Modal window
  // copies the status-bar style once, as it opens, so the dark style is set first.
  it('turns the status bar dark before the page opens', () => {
    const onAnswer = jest.fn();
    const { UNSAFE_getByType, queryByTestId } = render(
      <I18nProvider>
        <AnalyticsConsentPage visible onAnswer={onAnswer} />
      </I18nProvider>,
    );
    expect(UNSAFE_getByType(StatusBar).props.style).toBe('dark');
    expect(UNSAFE_getByType(Modal).props.visible).toBe(false);
    expect(queryByTestId('analytics-consent-page')).toBeNull();
    act(() => jest.advanceTimersByTime(STATUS_BAR_LEAD_MS));
    expect(UNSAFE_getByType(Modal).props.visible).toBe(true);
  });

  it('leaves the status bar alone while hidden', () => {
    const { UNSAFE_queryByType } = render(
      <I18nProvider>
        <AnalyticsConsentPage visible={false} onAnswer={jest.fn()} />
      </I18nProvider>,
    );
    expect(UNSAFE_queryByType(StatusBar)).toBeNull();
  });
});
