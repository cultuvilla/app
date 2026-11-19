import { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SignupQuestionsEditor, signupFieldErrors } from '../SignupQuestionsEditor';
import type { SignupFieldSpec } from '@cultuvilla/shared/models/event/SignupFieldModel';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

/** The editor is controlled, so drive it through a stateful host. */
function Host({
  initial = [],
  lockedCount = 0,
  onValue,
}: {
  initial?: SignupFieldSpec[];
  lockedCount?: number;
  onValue: (next: SignupFieldSpec[]) => void;
}) {
  const [value, setValue] = useState<SignupFieldSpec[]>(initial);
  return (
    <SignupQuestionsEditor
      value={value}
      lockedCount={lockedCount}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

const field = (over: Partial<SignupFieldSpec> = {}): SignupFieldSpec => ({
  id: 'f1',
  label: 'Talla',
  type: 'text',
  required: false,
  options: [],
  ...over,
});

const last = (fn: jest.Mock) => fn.mock.calls.at(-1)?.[0] as SignupFieldSpec[];

describe('SignupQuestionsEditor', () => {
  it('adds a question of the picked type and expands it for editing', () => {
    const onValue = jest.fn();
    const { getByTestId } = render(<Host onValue={onValue} />);

    fireEvent.press(getByTestId('signup-question-add'));
    fireEvent.press(getByTestId('type-sheet-row-select'));

    const added = last(onValue);
    expect(added).toHaveLength(1);
    expect(added[0]?.id).toBeTruthy();
    expect(added[0]?.type).toBe('select');

    // The new card opens expanded, so its label field is on screen.
    fireEvent.changeText(getByTestId('signup-question-label-0'), 'Talla de camiseta');
    expect(last(onValue)[0]?.label).toBe('Talla de camiseta');
  });

  it('removes a question from its expanded card', () => {
    const onValue = jest.fn();
    const { getByTestId } = render(
      <Host initial={[field({ id: 'a' }), field({ id: 'b' })]} onValue={onValue} />,
    );
    fireEvent.press(getByTestId('signup-question-0-summary'));
    fireEvent.press(getByTestId('signup-question-0-remove'));
    expect(last(onValue).map((f) => f.id)).toEqual(['b']);
  });

  it('reorders questions', () => {
    const onValue = jest.fn();
    const { getByTestId } = render(
      <Host initial={[field({ id: 'a' }), field({ id: 'b' })]} onValue={onValue} />,
    );
    fireEvent.press(getByTestId('signup-question-1-summary'));
    fireEvent.press(getByTestId('signup-question-1-up'));
    expect(last(onValue).map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('drops stale options when the question type changes', () => {
    const onValue = jest.fn();
    const { getByTestId } = render(
      <Host initial={[field({ type: 'select', options: ['M'] })]} onValue={onValue} />,
    );
    fireEvent.press(getByTestId('signup-question-0-summary'));
    fireEvent.press(getByTestId('signup-question-type-0'));
    fireEvent.press(getByTestId('type-sheet-row-number'));

    const retyped = last(onValue)[0];
    expect(retyped?.type).toBe('number');
    expect(retyped?.options).toEqual([]);
  });

  it('freezes locked questions: no delete, no reorder, no retype', () => {
    const onValue = jest.fn();
    const { queryByTestId, getByTestId } = render(
      <Host initial={[field({ id: 'a' }), field({ id: 'b' })]} lockedCount={1} onValue={onValue} />,
    );
    fireEvent.press(getByTestId('signup-question-0-summary'));
    expect(queryByTestId('signup-question-0-remove')).toBeNull();
    expect(queryByTestId('signup-question-0-up')).toBeNull();
    expect(queryByTestId('signup-question-type-0')).toBeNull();

    // Relabelling and the required toggle stay available — neither strands answers.
    fireEvent.changeText(getByTestId('signup-question-label-0'), 'Talla (camiseta)');
    expect(last(onValue)[0]?.label).toBe('Talla (camiseta)');

    // A question added after the lock point is still fully editable, and it
    // cannot be moved above the frozen prefix.
    fireEvent.press(getByTestId('signup-question-1-summary'));
    expect(getByTestId('signup-question-1-remove')).toBeTruthy();
    onValue.mockClear();
    fireEvent.press(getByTestId('signup-question-1-up'));
    expect(onValue).not.toHaveBeenCalled();
  });
});

describe('signupFieldErrors', () => {
  it('flags an unlabelled question and a select with no usable option', () => {
    expect(
      signupFieldErrors([
        field({ id: 'a', label: '  ' }),
        field({ id: 'b', type: 'select', options: [' '] }),
        field({ id: 'c', type: 'select', options: ['M'] }),
      ]),
    ).toEqual({ 0: 'emptyLabel', 1: 'needsOptions' });
  });
});
