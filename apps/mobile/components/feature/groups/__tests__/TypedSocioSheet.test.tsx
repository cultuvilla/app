import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { TypedSocioSheet, type TypedSocioValues } from '../TypedSocioSheet';
import { OptionsSheet } from '../OptionsSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

const PACO: TypedSocioValues = { displayName: 'Paco', socioNumber: '57', phone: '611', email: '' };
const free = () => false;

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('TypedSocioSheet', () => {
  it('refuses a blank name and says why, without saving', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(<TypedSocioSheet visible initial={null} isNumberTaken={free} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.changeText(getByTestId('typed-socio-name'), '   ');
    fireEvent.press(getByTestId('typed-socio-save'));
    expect(getByText('groups.socios.nameRequired')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows it is saving, then closes once the save lands', async () => {
    const save = deferred();
    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <TypedSocioSheet visible initial={null} isNumberTaken={free} onSave={() => save.promise} onClose={onClose} />,
    );
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(getByTestId('typed-socio-save'));
    expect(getByTestId('typed-socio-save-spinner')).toBeTruthy();
    await act(async () => save.resolve());
    expect(onClose).toHaveBeenCalled();
    expect(queryByTestId('typed-socio-save-spinner')).toBeNull();
  });

  it('on a refused write: tells the admin, stays open with their input, and can save again', async () => {
    const save = deferred();
    const onSave = jest.fn(() => save.promise);
    const onClose = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <TypedSocioSheet visible initial={null} isNumberTaken={free} onSave={onSave} onClose={onClose} />,
    );
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.press(getByTestId('typed-socio-save'));
    await act(async () => save.reject(new Error('permission-denied')));
    expect(Alert.alert).toHaveBeenCalledWith('groups.socios.error');
    expect(onClose).not.toHaveBeenCalled();
    expect(queryByTestId('typed-socio-save-spinner')).toBeNull();
    expect(getByTestId('typed-socio-name').props.value).toBe('Lola');
    onSave.mockResolvedValueOnce(undefined);
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('keeps what is being typed when the roster re-renders it with a fresh initial', () => {
    const props = { visible: true, isNumberTaken: free, onSave: jest.fn(), onClose: jest.fn() };
    const { getByTestId, rerender } = render(<TypedSocioSheet {...props} initial={{ ...PACO }} />);
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Paco Pérez');
    rerender(<TypedSocioSheet {...props} initial={{ ...PACO }} />);
    expect(getByTestId('typed-socio-name').props.value).toBe('Paco Pérez');
  });

  it('starts again from the socio when reopened', () => {
    const props = { isNumberTaken: free, onSave: jest.fn(), onClose: jest.fn() };
    const { getByTestId, rerender } = render(<TypedSocioSheet {...props} visible initial={PACO} />);
    fireEvent.changeText(getByTestId('typed-socio-name'), 'abandoned edit');
    rerender(<TypedSocioSheet {...props} visible={false} initial={PACO} />);
    rerender(<TypedSocioSheet {...props} visible initial={PACO} />);
    expect(getByTestId('typed-socio-name').props.value).toBe('Paco');
    expect(getByTestId('typed-socio-phone').props.value).toBe('611');
    expect(getByTestId('typed-socio-number').props.value).toBe('57');
  });

  it('saves the typed number as a number, and a blank one as null', async () => {
    const onSave = jest.fn(() => Promise.resolve());
    const { getByTestId } = render(<TypedSocioSheet visible initial={null} isNumberTaken={free} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.changeText(getByTestId('typed-socio-number'), ' 120 ');
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Lola', socioNumber: 120 })));
    fireEvent.changeText(getByTestId('typed-socio-number'), '');
    fireEvent.press(getByTestId('typed-socio-save'));
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ socioNumber: null })));
  });

  it('refuses a number that is not one, or that another socio has', () => {
    const onSave = jest.fn();
    const { getByTestId, getByText } = render(
      <TypedSocioSheet visible initial={null} isNumberTaken={(n) => n === 7} onSave={onSave} onClose={jest.fn()} />,
    );
    fireEvent.changeText(getByTestId('typed-socio-name'), 'Lola');
    fireEvent.changeText(getByTestId('typed-socio-number'), '7a');
    fireEvent.press(getByTestId('typed-socio-save'));
    expect(getByText('groups.socios.socioNumberInvalid')).toBeTruthy();
    fireEvent.changeText(getByTestId('typed-socio-number'), '7');
    fireEvent.press(getByTestId('typed-socio-save'));
    expect(getByText('groups.socios.socioNumberTaken')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('scrolls its fields inside the sheet, so they stay reachable with the keyboard up', () => {
    const { getByTestId } = render(<TypedSocioSheet visible initial={null} isNumberTaken={free} onSave={jest.fn()} onClose={jest.fn()} />);
    const scroll = getByTestId('typed-socio-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scroll.props.style).toMatchObject({ flexShrink: 1 });
  });
});

describe('OptionsSheet', () => {
  it('reaches the last of more options than fit on screen', async () => {
    const options = Array.from({ length: 60 }, (_, i) => ({ key: `m${i}`, label: `Miembro ${i}` }));
    const onPick = jest.fn();
    const { getByTestId } = render(
      <OptionsSheet visible title="t" options={options} onPick={onPick} onClose={jest.fn()} testID="pick" />,
    );
    expect(getByTestId('pick-scroll').props.style).toMatchObject({ flexShrink: 1 });
    fireEvent.press(getByTestId('pick-m59'));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith('m59'));
  });
});
