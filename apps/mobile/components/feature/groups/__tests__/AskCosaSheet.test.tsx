import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildCosaData } from '@cultuvilla/shared/models/organization';
import { requestCosa } from '@cultuvilla/shared/services/cosatecaService';
import { AskCosaSheet } from '../cosateca/AskCosaSheet';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({ requestCosa: jest.fn().mockResolvedValue('r9') }));

function cosa(kind: 'prestamo' | 'regalo') {
  return {
    id: 'c1',
    ...buildCosaData({
      municipalityId: 'm1', orgId: 'pena', audience: 'pueblo', ownerUid: 'u2', ownerName: 'Luis', kind, title: 'Taladro',
      category: 'herramientas', createdBy: 'u2',
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('AskCosaSheet', () => {
  it("asks as the viewer, copying the cosa's fields, and hands back the new request", async () => {
    const onClose = jest.fn();
    const onSent = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <AskCosaSheet visible cosa={cosa('prestamo')} uid="u1" myName="Ana" onClose={onClose} onSent={onSent} />,
    );
    expect(getByTestId('ask-cosa-sheet')).toBeTruthy();
    expect(getByTestId('ask-cosa-dates')).toBeTruthy();
    // Clearing is offered only once dates are picked.
    expect(queryByTestId('ask-cosa-clear-dates')).toBeNull();
    fireEvent.changeText(getByTestId('ask-cosa-message'), ' Para el sábado ');
    fireEvent.press(getByTestId('ask-cosa-send'));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('r9'));
    expect(onClose).toHaveBeenCalled();
    expect(requestCosa).toHaveBeenCalledWith({
      municipalityId: 'm1', orgId: 'pena', cosaId: 'c1', cosaTitle: 'Taladro', cosaKind: 'prestamo', ownerUid: 'u2',
      requesterUid: 'u1', requesterName: 'Ana', message: 'Para el sábado', fromOn: null, untilOn: null,
    });
  });

  it('asks no dates for a regalo', () => {
    const { queryByTestId } = render(<AskCosaSheet visible cosa={cosa('regalo')} uid="u1" myName="Ana" onClose={jest.fn()} onSent={jest.fn()} />);
    expect(queryByTestId('ask-cosa-dates')).toBeNull();
  });

  it('says why when the request is refused', async () => {
    jest.mocked(requestCosa).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const { getByTestId } = render(<AskCosaSheet visible cosa={cosa('prestamo')} uid="u1" myName="Ana" onClose={jest.fn()} onSent={jest.fn()} />);
    fireEvent.press(getByTestId('ask-cosa-send'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('groups.cosateca.errors.permission'));
  });
});
