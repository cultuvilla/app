import { Alert, type AlertButton } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { buildCosaData, DEFAULT_RESERVA_CONFIG } from '@cultuvilla/shared/models/organization';
import { bookReservaSlot, setReservaBlackouts } from '@cultuvilla/shared/services/cosatecaService';
import { MyReservas, ReservaBlackouts, ReservaBooking } from '../cosateca/Reserva';

let mockTaken: { id: string; requestId: string }[] = [];

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({
  bookReservaSlot: jest.fn().mockResolvedValue({ requestId: 'b9', status: 'accepted' }),
  setReservaBlackouts: jest.fn().mockResolvedValue({ cancelled: 2 }),
  watchCosaSlots: jest.fn(),
}));
jest.mock('../../../../lib/hooks/useWatch', () => ({ useWatch: () => ({ data: mockTaken, status: 'ready' }) }));

// Tuesday 10 November 2026, 11:00 in Madrid: Thursday the 12th is two days out.
const NOW = new Date('2026-11-10T10:00:00.000Z');
const SLOT_18 = '2026-11-12T17:00:00.000Z';
const SLOT_19 = '2026-11-12T18:00:00.000Z';

function pista(blackouts: string[] = []) {
  const data = buildCosaData({
    municipalityId: 'm1', orgId: 'ayto', audience: 'pueblo', ownerUid: null, ownerName: 'Ayuntamiento', kind: 'reserva',
    title: 'Pista de pádel', category: 'deporte', createdBy: 'admin',
  });
  return { id: 'pista', ...data, reserva: { ...DEFAULT_RESERVA_CONFIG, blackouts } };
}

/** Confirms whatever the next Alert asks. */
function confirmAlerts() {
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((b) => b.style !== 'cancel')?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'nextTick', 'queueMicrotask', 'clearTimeout', 'clearInterval'] });
  mockTaken = [];
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ReservaBooking', () => {
  it('shows the day’s slots, never lets a taken one be booked, and books a free one', async () => {
    mockTaken = [{ id: SLOT_19, requestId: 'someone-else' }];
    confirmAlerts();
    const onBooked = jest.fn();
    const { getByTestId } = render(<ReservaBooking cosa={pista()} canBook myBookings={[]} onBooked={onBooked} />);
    fireEvent.press(getByTestId('reserva-day-2026-11-12'));

    expect(getByTestId('reserva-slot-19:00')).toHaveTextContent(/taken/);
    fireEvent.press(getByTestId('reserva-slot-19:00'));
    expect(bookReservaSlot).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('reserva-slot-18:00'));
    await waitFor(() => expect(onBooked).toHaveBeenCalledWith('b9'));
    expect(bookReservaSlot).toHaveBeenCalledWith('pista', new Date(SLOT_18));
  });

  it('shows the viewer’s own booking as theirs', () => {
    mockTaken = [{ id: SLOT_18, requestId: 'mine' }];
    const { getByTestId } = render(
      <ReservaBooking cosa={pista()} canBook myBookings={[{ id: 'mine' } as never]} onBooked={jest.fn()} />,
    );
    fireEvent.press(getByTestId('reserva-day-2026-11-12'));
    expect(getByTestId('reserva-slot-18:00')).toHaveTextContent(/mine/);
  });

  it('has nothing to book on a closed day, and books nothing for whoever may not', () => {
    const closed = render(<ReservaBooking cosa={pista(['2026-11-12'])} canBook myBookings={[]} onBooked={jest.fn()} />);
    fireEvent.press(closed.getByTestId('reserva-day-2026-11-12'));
    expect(closed.getByTestId('reserva-no-slots')).toBeTruthy();
    closed.unmount();

    confirmAlerts();
    const owner = render(<ReservaBooking cosa={pista()} canBook={false} myBookings={[]} onBooked={jest.fn()} />);
    fireEvent.press(owner.getByTestId('reserva-day-2026-11-12'));
    fireEvent.press(owner.getByTestId('reserva-slot-18:00'));
    expect(bookReservaSlot).not.toHaveBeenCalled();
  });
});

describe('ReservaBlackouts', () => {
  it('reopens a closed day, and says how many bookings a change cancelled', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByTestId } = render(<ReservaBlackouts cosa={pista(['2026-11-12', '2026-11-20'])} />);
    fireEvent.press(getByTestId('reserva-reopen-2026-11-12'));
    await waitFor(() => expect(setReservaBlackouts).toHaveBeenCalledWith('pista', ['2026-11-20']));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('groups.cosateca.reserva.cancelledN'));
  });

  it('closes a picked range of days, after asking', async () => {
    confirmAlerts();
    const { getByTestId } = render(<ReservaBlackouts cosa={pista(['2026-11-20'])} />);
    expect(getByTestId('reserva-blackout-range')).toBeTruthy();
    fireEvent.press(getByTestId('reserva-blackout-range-trigger'));
    fireEvent.press(getByTestId('reserva-blackout-range-calendar-day-2026-11-12'));
    fireEvent.press(getByTestId('reserva-blackout-range-calendar-day-2026-11-13'));
    fireEvent.press(getByTestId('reserva-blackout-range-confirm'));
    fireEvent.press(getByTestId('reserva-close-days'));
    await waitFor(() => expect(setReservaBlackouts).toHaveBeenCalledWith('pista', ['2026-11-12', '2026-11-13', '2026-11-20']));
  });

  it('lists only the days still ahead', () => {
    const { queryByTestId } = render(<ReservaBlackouts cosa={pista(['2026-11-01', '2026-11-20'])} />);
    expect(queryByTestId('reserva-reopen-2026-11-01')).toBeNull();
    expect(queryByTestId('reserva-reopen-2026-11-20')).toBeTruthy();
  });
});

describe('MyReservas', () => {
  it('lists my bookings, each opening its own', () => {
    const onOpen = jest.fn();
    const booking = {
      id: 'b1', status: 'accepted', fromOn: '2026-11-12', startAt: new Date(SLOT_18), endAt: new Date(SLOT_19),
    } as never;
    const { getByTestId } = render(<MyReservas bookings={[booking]} onOpen={onOpen} />);
    fireEvent.press(getByTestId('reserva-mine-b1'));
    expect(onOpen).toHaveBeenCalledWith('b1');
  });
});
