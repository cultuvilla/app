import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { FiestaEditionEditor } from '../FiestaEditionEditor';
import { deleteFiestaEdition, saveFiestaEdition } from '@cultuvilla/shared/services/fiestaEditionService';
import { showConfirm } from '../../../../lib/dialogs';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/dialogs', () => ({ showConfirm: jest.fn() }));
jest.mock('@cultuvilla/shared/services/fiestaEditionService', () => ({
  saveFiestaEdition: jest.fn(() => Promise.resolve('m1_santiago_2026')),
  deleteFiestaEdition: jest.fn(() => Promise.resolve()),
}));

const santiago = { id: 'santiago', name: 'Santiago', month: 7 };
function edition(startDay: string, endDay: string) {
  return {
    id: 'm1_santiago_2026', municipalityId: 'm1', villageSlug: 'villa', blockId: 'santiago', year: 2026,
    startDay, endDay, proposedBy: 'u1', createdAt: new Date(), updatedAt: new Date(), block: santiago,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('FiestaEditionEditor', () => {
  it('saves the days for the block and year', async () => {
    const onDone = jest.fn();
    const { getByTestId } = render(
      <FiestaEditionEditor municipalityId="m1" block={santiago} year={2026} edition={edition('2026-07-24', '2026-07-26')} uid="u1" canDelete={false} onDone={onDone} />,
    );
    expect(getByTestId('fiesta-edition-editor-santiago')).toBeTruthy();
    expect(getByTestId('fiesta-edition-range-santiago')).toBeTruthy();
    fireEvent.press(getByTestId('fiesta-edition-save'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(saveFiestaEdition).toHaveBeenCalledWith({ municipalityId: 'm1', blockId: 'santiago', year: 2026, startDay: '2026-07-24', endDay: '2026-07-26', uid: 'u1' });
  });

  it('explains a range that is not an edition of the year, and will not save it', () => {
    const { getByTestId } = render(
      <FiestaEditionEditor municipalityId="m1" block={santiago} year={2026} edition={edition('2026-07-01', '2026-08-15')} uid="u1" canDelete={false} onDone={jest.fn()} />,
    );
    expect(getByTestId('fiesta-edition-problem')).toBeTruthy();
    fireEvent.press(getByTestId('fiesta-edition-save'));
    expect(saveFiestaEdition).not.toHaveBeenCalled();
  });

  it('cancels, and takes an edition down only after confirming', async () => {
    const onDone = jest.fn();
    const { getByTestId } = render(
      <FiestaEditionEditor municipalityId="m1" block={santiago} year={2026} edition={edition('2026-07-24', '2026-07-26')} uid="u1" canDelete onDone={onDone} />,
    );
    fireEvent.press(getByTestId('fiesta-edition-cancel'));
    expect(onDone).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId('fiesta-edition-remove'));
    expect(deleteFiestaEdition).not.toHaveBeenCalled();
    const confirm = (showConfirm as jest.Mock).mock.calls[0]?.[2] as () => void;
    confirm();
    await waitFor(() => expect(deleteFiestaEdition).toHaveBeenCalledWith('m1_santiago_2026'));
  });
});
