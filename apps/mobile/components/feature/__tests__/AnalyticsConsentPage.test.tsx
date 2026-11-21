import { fireEvent, render } from '@testing-library/react-native';
import { Modal } from 'react-native';
import { AnalyticsConsentPage } from '../AnalyticsConsentPage';
import { I18nProvider } from '../../../lib/i18n';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const setup = () => {
  const onAnswer = jest.fn();
  const view = render(
    <I18nProvider>
      <AnalyticsConsentPage visible onAnswer={onAnswer} />
    </I18nProvider>,
  );
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
});
