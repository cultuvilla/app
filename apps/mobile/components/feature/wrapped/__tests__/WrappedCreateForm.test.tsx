import { fireEvent, render } from '@testing-library/react-native';
import { WrappedCreateForm } from '../WrappedCreateForm';
import type { WrappedFormState } from '../../../../lib/wrapped/wrappedForm';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

const fiestas = [{ id: 'carmen', name: 'Carmen', month: 7 }];
const blocks: WrappedFormState['blocks'] = [
  { blockId: 'carmen', name: 'Carmen', month: 7, enabled: true, range: { startDay: '2026-07-14', endDay: '2026-07-16' } },
];

function renderForm(state: WrappedFormState, onChange = jest.fn()) {
  const utils = render(
    <WrappedCreateForm
      municipalityId="m1"
      year={2026}
      today="2026-09-01"
      fiestas={fiestas}
      state={state}
      onChange={onChange}
      onSubmit={jest.fn()}
      submitting={false}
      submitLabel="Crear"
    />,
  );
  return { ...utils, onChange };
}

describe('<WrappedCreateForm> range', () => {
  it('follows the fiestas with no reset and no problem while nothing is picked by hand', () => {
    const { getByTestId, queryByTestId } = renderForm({ blocks, customRange: null });
    expect(getByTestId('wrapped-range')).toBeTruthy();
    expect(queryByTestId('wrapped-range-reset')).toBeNull();
    expect(queryByTestId('wrapped-problem')).toBeNull();
  });

  it('names a hand-picked range that misses a fiesta, and resets it to follow them', () => {
    const { getByTestId, onChange } = renderForm({
      blocks,
      customRange: { startDay: '2026-08-01', endDay: '2026-08-05' },
    });
    expect(getByTestId('wrapped-problem')).toBeTruthy();
    expect(getByTestId('wrapped-submit').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(getByTestId('wrapped-range-reset'));
    expect(onChange).toHaveBeenCalledWith({ blocks, customRange: null });
  });
});
