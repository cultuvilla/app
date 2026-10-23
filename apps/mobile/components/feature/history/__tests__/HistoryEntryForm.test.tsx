import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { uploadHistoryEntryImage } from '@cultuvilla/shared/services/imageService';
import { pickImageAsBlob } from '../../../../lib/images';
import { HistoryEntryForm } from '../HistoryEntryForm';

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/useMentionSources', () => ({
  useMentionSources: () => ({ candidates: [], loading: false }),
}));
jest.mock('../../../../lib/images', () => ({ pickImageAsBlob: jest.fn() }));
jest.mock('@cultuvilla/shared/services/imageService', () => ({
  uploadHistoryEntryImage: jest.fn(),
}));
jest.mock('../../MentionTextInput', () => ({
  MentionTextInput: ({ value, onChange, testID }: {
    value: string;
    onChange: (t: string, m: [], l: [], k: []) => void;
    testID?: string;
  }) => {
    const { TextInput } = require('react-native');
    return <TextInput testID={testID} value={value} onChangeText={(t: string) => onChange(t, [], [], [])} />;
  },
}));

function setup() {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const utils = render(<HistoryEntryForm municipalityId="m1" entryId="h1" onSubmit={onSubmit} />);
  return { onSubmit, ...utils };
}

describe('HistoryEntryForm', () => {
  it('submits a BC, approximate, sourced entry', async () => {
    const { onSubmit, getByTestId } = setup();
    fireEvent.changeText(getByTestId('history-title-input'), '  Asentamiento romano ');
    fireEvent.changeText(getByTestId('history-start-year'), '218');
    fireEvent.press(getByTestId('history-start-bc'));
    fireEvent.press(getByTestId('history-approximate-toggle'));
    fireEvent.changeText(getByTestId('history-body-input'), 'Restos de una villa.');
    fireEvent.changeText(getByTestId('history-sources-input'), 'Carta arqueológica');
    fireEvent.press(getByTestId('history-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      title: '  Asentamiento romano ',
      body: { text: 'Restos de una villa.', mentions: [], links: [], marks: [] },
      images: [],
      start: { year: -218, month: null, day: null },
      end: null,
      approximate: true,
      sources: 'Carta arqueológica',
    });
  });

  it('submits a month-precise range', async () => {
    const { onSubmit, getByTestId } = setup();
    fireEvent.changeText(getByTestId('history-title-input'), 'Guerra Civil');
    fireEvent.changeText(getByTestId('history-start-year'), '1936');
    fireEvent.press(getByTestId('history-start-month-7'));
    fireEvent.changeText(getByTestId('history-start-day'), '18');
    fireEvent.press(getByTestId('history-range-toggle'));
    fireEvent.changeText(getByTestId('history-end-year'), '1939');
    fireEvent.press(getByTestId('history-end-month-4'));
    fireEvent.press(getByTestId('history-submit'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      start: { year: 1936, month: 7, day: 18 },
      end: { year: 1939, month: 4, day: null },
    });
  });

  it('refuses to submit without a title or a year', async () => {
    const { onSubmit, getByTestId, findByText } = setup();
    fireEvent.press(getByTestId('history-submit'));
    expect(await findByText('village.history.form.errors.titleRequired')).toBeTruthy();

    fireEvent.changeText(getByTestId('history-title-input'), 'Algo');
    fireEvent.press(getByTestId('history-submit'));
    expect(await findByText('village.history.form.errors.yearRequired')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a range that ends before it starts', async () => {
    const { onSubmit, getByTestId, findByText } = setup();
    fireEvent.changeText(getByTestId('history-title-input'), 'Algo');
    fireEvent.changeText(getByTestId('history-start-year'), '1939');
    fireEvent.press(getByTestId('history-range-toggle'));
    fireEvent.changeText(getByTestId('history-end-year'), '1936');
    fireEvent.press(getByTestId('history-submit'));
    expect(await findByText('village.history.form.errors.endBeforeStart')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says so when the photo upload fails, instead of dropping the photo', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (pickImageAsBlob as jest.Mock).mockResolvedValueOnce({ blob: {} as Blob, filename: 'a.jpg', contentType: 'image/jpeg', previewUri: 'file://a.jpg' });
    (uploadHistoryEntryImage as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('Max retry time exceeded'), { code: 'storage/retry-limit-exceeded' }),
    );
    const { getByTestId } = render(<HistoryEntryForm municipalityId="m1" entryId="h1" onSubmit={jest.fn()} />);
    fireEvent.press(getByTestId('history-images-add'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Sin conexión', expect.any(String), expect.any(Array), expect.anything()));
    alert.mockRestore();
  });
});
