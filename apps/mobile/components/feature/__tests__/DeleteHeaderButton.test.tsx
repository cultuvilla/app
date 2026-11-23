import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { DeleteHeaderButton } from '../DeleteHeaderButton';

const props = {
  accessibilityLabel: 'Eliminar',
  confirmTitle: 'Eliminar',
  confirmMessage: '¿Seguro?',
  confirmLabel: 'Eliminar',
  cancelLabel: 'Cancelar',
  deletingLabel: 'Eliminando…',
};

describe('DeleteHeaderButton', () => {
  it('fires onConfirm when the destructive Alert button is pressed', () => {
    const onConfirm = jest.fn();
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      btns?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { getByLabelText } = render(<DeleteHeaderButton {...props} onConfirm={onConfirm} />);
    fireEvent.press(getByLabelText('Eliminar'));
    expect(spy).toHaveBeenCalledWith('Eliminar', '¿Seguro?', expect.any(Array));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('offers the alternative as its own destructive button', () => {
    const onConfirm = jest.fn();
    const onAlternative = jest.fn();
    const spy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns) => {
      btns?.find((b) => b.text === 'Este y los siguientes')?.onPress?.();
    });
    const { getByLabelText } = render(
      <DeleteHeaderButton
        {...props}
        onConfirm={onConfirm}
        alternative={{ label: 'Este y los siguientes', onConfirm: onAlternative }}
      />,
    );
    fireEvent.press(getByLabelText('Eliminar'));
    expect(onAlternative).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
