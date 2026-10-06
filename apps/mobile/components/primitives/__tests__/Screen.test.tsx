import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Screen } from '../Screen';

describe('<Screen>', () => {
  it('renders children inside a SafeAreaView', () => {
    const { getByText } = render(
      <Screen>
        <Text>hello</Text>
      </Screen>
    );
    expect(getByText('hello')).toBeTruthy();
  });

  it('applies padding by default', () => {
    const { getByTestId } = render(
      <Screen testID="screen">
        <Text>x</Text>
      </Screen>
    );
    const screen = getByTestId('screen');
    expect(screen.props.className).toMatch(/p-4|px-4/);
  });
});

// Regression: Screen never claimed the bottom safe-area edge, so on devices
// with a home indicator / gesture bar the last content (footer buttons, list
// tails) was clipped. Bottom is now claimed by default; tab screens and
// screens that apply insets.bottom themselves opt out via bottomInset={false}.
describe('<Screen> safe-area edges', () => {
  const edgesOf = (ui: React.ReactElement): string[] => {
    const { UNSAFE_getByType } = render(ui);
    return UNSAFE_getByType(SafeAreaView).props.edges as string[];
  };

  it('claims the bottom edge by default', () => {
    expect(edgesOf(<Screen><Text>x</Text></Screen>)).toContain('bottom');
  });

  it('claims the top edge by default', () => {
    expect(edgesOf(<Screen><Text>x</Text></Screen>)).toContain('top');
  });

  it('omits the bottom edge when bottomInset is false', () => {
    expect(edgesOf(<Screen bottomInset={false}><Text>x</Text></Screen>)).not.toContain('bottom');
  });

  it('omits the top edge when topInset is false', () => {
    expect(edgesOf(<Screen topInset={false}><Text>x</Text></Screen>)).not.toContain('top');
  });
});

// Regression: forms set their own KeyboardAvoidingView with
// `behavior={ios ? 'padding' : undefined}`, and many set none — so on
// edge-to-edge Android the keyboard covered whatever was being typed.
describe('<Screen> keyboard', () => {
  it('keeps every screen clear of the keyboard', () => {
    const { UNSAFE_getByType } = render(<Screen><Text>x</Text></Screen>);
    expect(UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  it('lets taps through to buttons while the keyboard is open', () => {
    const { UNSAFE_getByType } = render(<Screen scroll><Text>x</Text></Screen>);
    expect(UNSAFE_getByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });
});
