import { ScrollView } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AttendeeSheet } from '../AttendeeSheet';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const baseProps = {
  visible: true,
  telephoneRequired: false,
  busy: false,
  onClose: jest.fn(),
  onCreateNew: jest.fn(),
  onConfirm: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('AttendeeSheet', () => {
  it('renders a row per persona and a status badge for those already registered', () => {
    const { getByText } = render(
      <AttendeeSheet
        {...baseProps}
        attendees={[
          { id: 'self', name: 'Ana', status: 'confirmed' },
          { id: 'dep1', name: 'Hijo' },
        ]}
      />,
    );
    expect(getByText('Ana')).toBeTruthy();
    expect(getByText('Hijo')).toBeTruthy();
    // Registered self shows the confirmed badge; the unregistered dependent does not.
    expect(getByText('event.register.signedUp')).toBeTruthy();
  });

  it('defaults selection to the registered personas and reports added ones on confirm', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <AttendeeSheet
        {...baseProps}
        onConfirm={onConfirm}
        attendees={[
          { id: 'self', name: 'Ana', status: 'confirmed' },
          { id: 'dep1', name: 'Hijo' },
        ]}
      />,
    );
    fireEvent.press(getByTestId('attendee-row-dep1')); // tick the dependent
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['self', 'dep1'], undefined, {});
  });

  it('gates confirm behind a valid phone on telephoneRequired events with a new attendee', () => {
    const onConfirm = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <AttendeeSheet
        {...baseProps}
        telephoneRequired
        onConfirm={onConfirm}
        attendees={[{ id: 'self', name: 'Ana' }]}
      />,
    );
    // No new attendee selected yet → no phone field.
    expect(queryByTestId('attendee-phone')).toBeNull();

    fireEvent.press(getByTestId('attendee-row-self')); // selecting a not-yet-registered persona
    const phone = getByTestId('attendee-phone');

    // Confirm blocked until the phone is filled.
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();

    // Invalid Spanish number (too short) still blocks confirm.
    fireEvent.changeText(phone, '12345');
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();

    // A valid number is reported to the parent in E.164 form (with the +34 prefix).
    fireEvent.changeText(phone, '600111222');
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['self'], '+34600111222', {});
  });

  it('prefills the phone from the saved profile number', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <AttendeeSheet
        {...baseProps}
        telephoneRequired
        savedPhone="+34600111222"
        onConfirm={onConfirm}
        attendees={[{ id: 'self', name: 'Ana' }]}
      />,
    );
    fireEvent.press(getByTestId('attendee-row-self'));
    expect(getByTestId('attendee-phone').props.value).toBe('600111222');
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['self'], '+34600111222', {});
  });

  it('shows the invalid-phone error only after Confirmar is pressed, not while typing', () => {
    const { getByTestId, queryByText, getByText } = render(
      <AttendeeSheet
        {...baseProps}
        telephoneRequired
        attendees={[{ id: 'self', name: 'Ana' }]}
      />,
    );
    fireEvent.press(getByTestId('attendee-row-self'));
    const phone = getByTestId('attendee-phone');

    // Typing a still-invalid number must NOT nag — the error is silent until submit.
    fireEvent.changeText(phone, '123');
    expect(queryByText('event.register.phoneInvalid')).toBeNull();

    // Pressing Confirmar with an invalid number reveals the error (the button is
    // reachable — it is not disabled just because the phone is invalid).
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(getByText('event.register.phoneInvalid')).toBeTruthy();

    // Correcting the number clears the error again.
    fireEvent.changeText(phone, '600111222');
    expect(queryByText('event.register.phoneInvalid')).toBeNull();
  });

  it('validates against the selected country prefix', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <AttendeeSheet
        {...baseProps}
        telephoneRequired
        onConfirm={onConfirm}
        attendees={[{ id: 'self', name: 'Ana' }]}
      />,
    );
    fireEvent.press(getByTestId('attendee-row-self'));

    // '12345' is invalid for Spain (+34) but valid as a generic 5-digit number.
    fireEvent.changeText(getByTestId('attendee-phone'), '12345');
    fireEvent.press(getByTestId('attendee-phone-prefix'));
    fireEvent.press(getByTestId('attendee-phone-option-FR'));

    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['self'], '+3312345', {});
  });

  describe('custom signup fields', () => {
    const fields = [
      { id: 'size', label: 'Talla', type: 'select' as const, required: true, options: ['S', 'M'] },
      { id: 'note', label: 'Alergias', type: 'text' as const, required: false, options: [] },
    ];

    it('asks the fields once per newly-ticked persona, not for already-registered ones', () => {
      const { getByTestId, queryByTestId } = render(
        <AttendeeSheet
          {...baseProps}
          signupFields={fields}
          attendees={[
            { id: 'self', name: 'Ana', status: 'confirmed' },
            { id: 'dep1', name: 'Hijo' },
          ]}
        />,
      );
      // 'self' is already registered — their answers were collected back then.
      expect(queryByTestId('attendee-answer-self-size')).toBeNull();
      expect(queryByTestId('attendee-answer-dep1-size')).toBeNull();

      fireEvent.press(getByTestId('attendee-row-dep1'));
      expect(getByTestId('attendee-answer-dep1-size-S')).toBeTruthy();
      expect(getByTestId('attendee-answer-dep1-note')).toBeTruthy();
      expect(queryByTestId('attendee-answer-self-size-S')).toBeNull();
    });

    it('blocks confirm until every required field is answered, then reports per persona', () => {
      const onConfirm = jest.fn();
      const { getByTestId, getByText } = render(
        <AttendeeSheet
          {...baseProps}
          signupFields={fields}
          onConfirm={onConfirm}
          attendees={[{ id: 'self', name: 'Ana' }]}
        />,
      );
      fireEvent.press(getByTestId('attendee-row-self'));

      fireEvent.press(getByTestId('attendee-confirm'));
      expect(onConfirm).not.toHaveBeenCalled();
      expect(getByText('event.register.answerRequired')).toBeTruthy();

      fireEvent.press(getByTestId('attendee-answer-self-size-M'));
      fireEvent.changeText(getByTestId('attendee-answer-self-note'), 'ninguna');
      fireEvent.press(getByTestId('attendee-confirm'));
      expect(onConfirm).toHaveBeenCalledWith(['self'], undefined, {
        self: { size: 'M', note: 'ninguna' },
      });
    });

    it('scrolls the first persona with a missing answer into view on a rejected confirm', () => {
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
      const { getByTestId } = render(
        <AttendeeSheet
          {...baseProps}
          signupFields={fields}
          attendees={[
            { id: 'self', name: 'Ana', status: 'confirmed' },
            { id: 'dep1', name: 'Hijo' },
          ]}
        />,
      );
      fireEvent.press(getByTestId('attendee-row-dep1'));
      fireEvent(getByTestId('attendee-row-wrap-dep1'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 240, width: 300, height: 120 } },
      });

      fireEvent.press(getByTestId('attendee-confirm'));
      expect(scrollTo).toHaveBeenCalledWith({ y: 232, animated: true });
      scrollTo.mockRestore();
    });

    it('keeps each persona’s answers separate', () => {
      const onConfirm = jest.fn();
      const { getByTestId } = render(
        <AttendeeSheet
          {...baseProps}
          signupFields={fields}
          onConfirm={onConfirm}
          attendees={[
            { id: 'self', name: 'Ana' },
            { id: 'dep1', name: 'Hijo' },
          ]}
        />,
      );
      fireEvent.press(getByTestId('attendee-row-self'));
      fireEvent.press(getByTestId('attendee-row-dep1'));
      fireEvent.press(getByTestId('attendee-answer-self-size-S'));
      fireEvent.press(getByTestId('attendee-answer-dep1-size-M'));
      fireEvent.press(getByTestId('attendee-confirm'));
      expect(onConfirm).toHaveBeenCalledWith(['self', 'dep1'], undefined, {
        self: { size: 'S' },
        dep1: { size: 'M' },
      });
    });
  });

  it('routes to persona creation via onCreateNew', () => {
    const onCreateNew = jest.fn();
    const { getByTestId } = render(
      <AttendeeSheet {...baseProps} onCreateNew={onCreateNew} attendees={[{ id: 'self', name: 'Ana' }]} />,
    );
    fireEvent.press(getByTestId('attendee-create'));
    expect(onCreateNew).toHaveBeenCalled();
  });

  it('pre-selects personas passed in autoSelectIds (e.g. a freshly created dependent)', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <AttendeeSheet
        {...baseProps}
        onConfirm={onConfirm}
        autoSelectIds={['dep1']}
        attendees={[
          { id: 'self', name: 'Ana', status: 'confirmed' },
          { id: 'dep1', name: 'Hijo' },
        ]}
      />,
    );
    fireEvent.press(getByTestId('attendee-confirm'));
    expect(onConfirm).toHaveBeenCalledWith(['self', 'dep1'], undefined, {});
  });
});
