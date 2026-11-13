import { fireEvent, render } from '@testing-library/react-native';
import { buildCosaData } from '@cultuvilla/shared/models/organization';
import { CosaRow } from '../cosateca/CosaRows';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

describe('CosaRow', () => {
  it('shows where it is kept and whether it can be asked for', () => {
    const cosa = {
      id: 'c1',
      ...buildCosaData({
        municipalityId: 'm1', orgId: 'pena', audience: 'pueblo', ownerUid: null, ownerName: 'Peña', kind: 'prestamo',
        title: 'Escalera', category: 'herramientas', createdBy: 'u1', createdByName: 'Ana', locationNote: 'En el almacén',
      }),
    };
    const onPress = jest.fn();
    const { getByTestId } = render(<CosaRow cosa={cosa} onPress={onPress} />);
    expect(getByTestId('cosa-row-where-c1')).toHaveTextContent('En el almacén');
    expect(getByTestId('cosa-row-state-c1')).toHaveTextContent('groups.cosateca.availability.available');
    fireEvent.press(getByTestId('cosa-row-c1'));
    expect(onPress).toHaveBeenCalled();
  });
});
