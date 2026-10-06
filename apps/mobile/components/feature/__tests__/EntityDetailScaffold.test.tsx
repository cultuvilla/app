import { act, render } from '@testing-library/react-native';
import { KeyboardAvoidingView, RefreshControl, ScrollView, Text } from 'react-native';
import { EntityDetailScaffold } from '../EntityDetailScaffold';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));

describe('EntityDetailScaffold', () => {
  it('shows a spinner while loading and the title + body once loaded', () => {
    const { rerender, queryByText, getByText } = render(
      <EntityDetailScaffold loading imageUri={null} fallbackIcon="image-outline" title="Fiestas" />,
    );
    expect(queryByText('Fiestas')).toBeNull();

    rerender(
      <EntityDetailScaffold loading={false} imageUri={null} fallbackIcon="image-outline" title="Fiestas">
        <Text>cuerpo</Text>
      </EntityDetailScaffold>,
    );
    getByText('Fiestas');
    getByText('cuerpo');
  });

  it('renders the not-found state', () => {
    const { getByText } = render(
      <EntityDetailScaffold loading={false} notFound imageUri={null} fallbackIcon="image-outline" />,
    );
    getByText('common.notFound');
  });

  it('attaches no RefreshControl when onRefresh is omitted', () => {
    const { UNSAFE_queryByType } = render(
      <EntityDetailScaffold loading={false} imageUri={null} fallbackIcon="image-outline" />,
    );
    expect(UNSAFE_queryByType(RefreshControl)).toBeNull();
  });

  it('wires pull-to-refresh and calls onRefresh when triggered', async () => {
    const onRefresh = jest.fn().mockResolvedValue(undefined);
    const { UNSAFE_getByType } = render(
      <EntityDetailScaffold
        loading={false}
        imageUri={null}
        fallbackIcon="image-outline"
        onRefresh={onRefresh}
      />,
    );
    const control = UNSAFE_getByType(RefreshControl);
    expect(control.props.refreshing).toBe(false);

    await act(async () => {
      control.props.onRefresh();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(control.props.refreshing).toBe(false);
  });

  // Android is edge-to-edge, so the window no longer resizes for the keyboard:
  // without the KeyboardAvoidingView (Screen owns it) the composer at the bottom of a detail
  // screen is covered by the keyboard the moment it is focused.
  it('keeps the body clear of the keyboard and lets taps through while it is open', () => {
    const { UNSAFE_getByType } = render(
      <EntityDetailScaffold loading={false} imageUri={null} fallbackIcon="image-outline">
        <Text>cuerpo</Text>
      </EntityDetailScaffold>,
    );
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    expect(UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });
});
