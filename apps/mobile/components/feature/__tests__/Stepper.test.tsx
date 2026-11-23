// apps/mobile/components/feature/__tests__/Stepper.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Stepper, type StepConfig } from '../Stepper';

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function makeSteps(overrides: Partial<StepConfig>[] = []): StepConfig[] {
  const base: StepConfig[] = [
    { key: 'a', title: 'Step A', render: () => <Text>content-a</Text> },
    { key: 'b', title: 'Step B', render: () => <Text>content-b</Text> },
  ];
  return base.map((s, i) => ({ ...s, ...overrides[i] }));
}

describe('<Stepper>', () => {
  it('renders the first step content', () => {
    const { getByText } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} />,
    );
    // Step titles are no longer shown as text (icon-only indicator); the
    // current step's content is what renders.
    expect(getByText('content-a')).toBeTruthy();
  });

  it('advances to the next step when the current step is valid', () => {
    const { getByText } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} />,
    );
    fireEvent.press(getByText('common.stepper.next'));
    expect(getByText('content-b')).toBeTruthy();
  });

  it('blocks advancing while the current step is invalid', () => {
    const steps = makeSteps([{ validate: () => ['err'] }]);
    const { getByText, queryByText } = render(
      <Stepper steps={steps} submitLabel="Crear" onComplete={() => {}} />,
    );
    fireEvent.press(getByText('common.stepper.next'));
    expect(queryByText('content-b')).toBeNull();
  });

  it('goes back without validating', () => {
    const { getByText } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} />,
    );
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByText('common.stepper.back'));
    expect(getByText('content-a')).toBeTruthy();
  });

  it('calls onComplete from the last step', () => {
    const onComplete = jest.fn();
    const { getByText } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={onComplete} />,
    );
    fireEvent.press(getByText('common.stepper.next'));
    fireEvent.press(getByText('Crear'));
    expect(onComplete).toHaveBeenCalled();
  });

  it('lets you jump directly to any step in edit mode (allStepsReachable)', () => {
    const { getByText, getByTestId } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} allStepsReachable />,
    );
    // Tap the second step's dot without pressing Next — it navigates directly.
    fireEvent.press(getByTestId('step-dot-1'));
    expect(getByText('content-b')).toBeTruthy();
  });

  it('blocks tapping a not-yet-reached step in create mode', () => {
    const { getByTestId, queryByText } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} />,
    );
    fireEvent.press(getByTestId('step-dot-1'));
    expect(queryByText('content-b')).toBeNull();
  });

  it('will not submit from the last step while an earlier one is invalid', () => {
    const onComplete = jest.fn();
    const steps = makeSteps([{ validate: () => ['err'] }]);
    const { getByText, getByTestId } = render(
      <Stepper steps={steps} submitLabel="Guardar" onComplete={onComplete} allStepsReachable />,
    );
    fireEvent.press(getByTestId('step-dot-1'));
    fireEvent.press(getByText('Guardar'));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('gives the last step its own testID', () => {
    const { getByTestId } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} primaryTestID="next" submitTestID="save" />,
    );
    expect(getByTestId('next')).toHaveTextContent('common.stepper.next');
    fireEvent.press(getByTestId('next'));
    expect(getByTestId('save')).toHaveTextContent('Crear');
  });

  it('follows a step the form sets, and reports the ones it moves to', () => {
    const onStepChange = jest.fn();
    const { getByText, rerender } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} step={0} onStepChange={onStepChange} />,
    );
    fireEvent.press(getByText('common.stepper.next'));
    expect(onStepChange).toHaveBeenCalledWith(1);
    // Controlled: nothing moves until the form says so.
    expect(getByText('content-a')).toBeTruthy();
    rerender(<Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} step={1} onStepChange={onStepChange} />);
    expect(getByText('content-b')).toBeTruthy();
  });
});

describe('<Stepper> gestures', () => {
  // A horizontal drag is how text gets selected inside a step (mouse on web,
  // selection handles on native). A swipe responder here used to change steps
  // mid-selection, so no element may claim move gestures.
  it('attaches no move/swipe responder around the step content', () => {
    const { UNSAFE_root } = render(
      <Stepper steps={makeSteps()} submitLabel="Crear" onComplete={() => {}} />,
    );
    const responders = UNSAFE_root.findAll(
      (node) =>
        typeof node.props.onMoveShouldSetResponder === 'function' ||
        typeof node.props.onMoveShouldSetResponderCapture === 'function',
    );
    expect(responders).toHaveLength(0);
  });
});
