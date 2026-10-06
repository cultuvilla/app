import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FiestasEditor } from '../FiestasEditor';
import type { FiestaBlock } from '@cultuvilla/shared/models/municipality/FiestaBlockModel';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
// The date picker is native-heavy; stub it down to a button that emits a date.
const agosto: FiestaBlock = { id: 'agosto', name: 'Fiestas de agosto', month: 8 };

/** Wraps the controlled editor so edits round-trip like they do in the screen. */
function Harness({ initial, onChange }: { initial: FiestaBlock[]; onChange: jest.Mock }) {
  const [blocks, setBlocks] = useState(initial);
  return (
    <FiestasEditor
      blocks={blocks}
      onChange={(next) => {
        setBlocks(next);
        onChange(next);
      }}
    />
  );
}

describe('FiestasEditor', () => {
  it('adds a block from a typed name, with a slug id', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[]} onChange={onChange} />);
    fireEvent.changeText(getByTestId('fiesta-new-name'), 'Fiestas de Agosto');
    fireEvent.press(getByTestId('fiesta-add'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ id: 'fiestas-de-agosto', name: 'Fiestas de Agosto' });
  });

  it('does not add a block for a blank name', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[]} onChange={onChange} />);
    fireEvent.changeText(getByTestId('fiesta-new-name'), '   ');
    fireEvent.press(getByTestId('fiesta-add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes a block', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    fireEvent.press(getByTestId('fiesta-remove-agosto'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  // The reported bug: persisting each keystroke wrote name: '' on a clear, and
  // a municipality is read through a strict converter.
  it('never persists an empty name while typing', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    fireEvent.changeText(getByTestId('fiesta-agosto-name'), '');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reverts to the saved name when the field is left empty', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    const input = getByTestId('fiesta-agosto-name');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(onChange).not.toHaveBeenCalled();
    expect(getByTestId('fiesta-agosto-name').props.value).toBe('Fiestas de agosto');
  });

  it('commits a renamed block on blur, trimmed', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    const input = getByTestId('fiesta-agosto-name');
    fireEvent.changeText(input, '  Fiestas grandes  ');
    fireEvent(input, 'blur');
    expect(onChange.mock.calls[0][0][0].name).toBe('Fiestas grandes');
  });

  it('keeps the id stable across a rename', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    const input = getByTestId('fiesta-agosto-name');
    fireEvent.changeText(input, 'Otro nombre');
    fireEvent(input, 'blur');
    expect(onChange.mock.calls[0][0][0].id).toBe('agosto');
  });

  it('adds a block with a month, and nothing else', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[]} onChange={onChange} />);
    fireEvent.changeText(getByTestId('fiesta-new-name'), 'Carmen');
    fireEvent.press(getByTestId('fiesta-add'));
    expect(onChange.mock.calls[0][0][0]).toEqual({ id: 'carmen', name: 'Carmen', month: 8 });
  });

  it('sets the month', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    fireEvent.press(getByTestId('fiesta-agosto-month-7'));
    expect(onChange.mock.calls[0][0]).toEqual([{ ...agosto, month: 7 }]);
  });

  it('marks the selected month', () => {
    const { getByTestId } = render(<Harness initial={[agosto]} onChange={jest.fn()} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    expect(getByTestId('fiesta-agosto-month-8').props.accessibilityState).toMatchObject({ selected: true });
    expect(getByTestId('fiesta-agosto-month-7').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('shows a saved fiesta as a card, not as editable fields', () => {
    const { getByText, queryByTestId } = render(<Harness initial={[agosto]} onChange={jest.fn()} />);
    expect(getByText('Fiestas de agosto')).toBeTruthy();
    expect(getByText('Agosto')).toBeTruthy();
    expect(queryByTestId('fiesta-agosto-name')).toBeNull();
    expect(queryByTestId('fiesta-agosto-month-8')).toBeNull();
  });

  it('opens a fiesta for editing from its edit button and closes it with Listo', () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = render(<Harness initial={[agosto]} onChange={onChange} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    fireEvent.changeText(getByTestId('fiesta-agosto-name'), 'Fiestas grandes');
    fireEvent.press(getByTestId('fiesta-agosto-done'));
    expect(onChange.mock.calls[0][0][0].name).toBe('Fiestas grandes');
    expect(queryByTestId('fiesta-agosto-name')).toBeNull();
  });

  it('opens a newly added fiesta so its month can be picked', () => {
    const { getByTestId } = render(<Harness initial={[]} onChange={jest.fn()} />);
    fireEvent.changeText(getByTestId('fiesta-new-name'), 'Carmen');
    fireEvent.press(getByTestId('fiesta-add'));
    expect(getByTestId('fiesta-carmen-month-8')).toBeTruthy();
  });

  it('edits one fiesta at a time', () => {
    const carmen: FiestaBlock = { id: 'carmen', name: 'Carmen', month: 7 };
    const { getByTestId, queryByTestId } = render(<Harness initial={[agosto, carmen]} onChange={jest.fn()} />);
    fireEvent.press(getByTestId('fiesta-edit-agosto'));
    fireEvent.press(getByTestId('fiesta-edit-carmen'));
    expect(queryByTestId('fiesta-agosto-name')).toBeNull();
    expect(getByTestId('fiesta-carmen-name')).toBeTruthy();
  });
});
