import { render, fireEvent } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { MultiImagePickerRow } from '../MultiImagePickerRow';

describe('<MultiImagePickerRow>', () => {
  it('calls onRemove with the tapped thumbnail index', () => {
    const onRemove = jest.fn();
    const { getAllByLabelText } = render(
      <MultiImagePickerRow
        uris={['a', 'b', 'c']}
        onAddPress={() => {}}
        onRemove={onRemove}
        addLabel="add"
        removeLabel="remove"
      />,
    );
    const removeButtons = getAllByLabelText('remove');
    fireEvent.press(removeButtons[1]!);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('hides the "+" add tile once `max` images are already picked', () => {
    const { queryByLabelText } = render(
      <MultiImagePickerRow
        uris={['a', 'b', 'c', 'd', 'e']}
        onAddPress={() => {}}
        onRemove={() => {}}
        max={5}
        addLabel="add"
        removeLabel="remove"
      />,
    );
    expect(queryByLabelText('add')).toBeNull();
  });

  it('shows the "+" add tile under the cap', () => {
    const { queryByLabelText } = render(
      <MultiImagePickerRow
        uris={['a']}
        onAddPress={() => {}}
        onRemove={() => {}}
        max={5}
        addLabel="add"
        removeLabel="remove"
      />,
    );
    expect(queryByLabelText('add')).not.toBeNull();
  });

  // A horizontal ScrollView grows by default (flexGrow: 1). On the poster edit
  // screen that made the photo row fill the whole viewport and pushed the
  // year, title, dates and save button out of sight (E2E flow 83).
  it('hugs its thumbnails instead of growing to fill its column', () => {
    const { UNSAFE_getByType } = render(
      <MultiImagePickerRow
        uris={['a']}
        onAddPress={() => {}}
        onRemove={() => {}}
        addLabel="add"
        removeLabel="remove"
      />,
    );
    expect(StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.style)).toMatchObject({ flexGrow: 0 });
  });
});
