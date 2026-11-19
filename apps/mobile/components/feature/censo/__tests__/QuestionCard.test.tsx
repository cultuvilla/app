import { render, fireEvent } from '@testing-library/react-native';
import { QuestionCard } from '../QuestionCard';
import * as dialogs from '../../../../lib/dialogs';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

const baseField = { source: 'custom', key: 'color', label: 'Color', type: 'text', required: false } as const;

function renderCard(answeredCount: number, onRemove = jest.fn()) {
  const utils = render(
    <QuestionCard
      field={baseField}
      index={0}
      dispatch={jest.fn()}
      locked={answeredCount > 0}
      answeredCount={answeredCount}
      active
      onActivate={jest.fn()}
      onMove={jest.fn()}
      onRemove={onRemove}
    />,
  );
  return { ...utils, onRemove };
}

it('confirms before removing an answered question', () => {
  const spy = jest.spyOn(dialogs, 'showConfirm').mockImplementation((_t, _m, onConfirm) => onConfirm());
  const { getByLabelText, onRemove } = renderCard(3);
  fireEvent.press(getByLabelText('common.delete'));
  expect(spy).toHaveBeenCalled();
  expect(onRemove).toHaveBeenCalled();
  spy.mockRestore();
});

it('removes an unanswered question without confirmation', () => {
  const spy = jest.spyOn(dialogs, 'showConfirm');
  const { getByLabelText, onRemove } = renderCard(0);
  fireEvent.press(getByLabelText('common.delete'));
  expect(spy).not.toHaveBeenCalled();
  expect(onRemove).toHaveBeenCalled();
  spy.mockRestore();
});
