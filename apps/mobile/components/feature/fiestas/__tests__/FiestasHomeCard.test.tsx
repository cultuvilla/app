import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { FiestasHomeCard } from '../FiestasHomeCard';
import { useVillageFiestas } from '../../../../lib/fiestas/useVillageFiestas';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/fiestas/useVillageFiestas', () => ({ useVillageFiestas: jest.fn() }));

const mockFiestas = useVillageFiestas as jest.Mock;
const santiago = { id: 'santiago', name: 'Santiago', month: 7 };
const edition = {
  id: 'm1_santiago_2026',
  municipalityId: 'm1',
  villageSlug: 'villa',
  blockId: 'santiago',
  year: 2026,
  startDay: '2026-07-24',
  endDay: '2026-07-26',
  proposedBy: 'u1',
  createdAt: new Date(),
  updatedAt: new Date(),
  block: santiago,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date('2026-07-01T10:00:00Z'), advanceTimers: true });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('FiestasHomeCard', () => {
  it('leads to the programme of fiestas coming up', () => {
    mockFiestas.mockReturnValue({ fiestas: [santiago], editions: [edition], status: 'ready', error: null });
    const { getByTestId } = render(<FiestasHomeCard municipalityId="m1" villageSlug="villa" isMember={false} />);
    expect(getByTestId('fiestas-home-programme')).toBeTruthy();
    fireEvent.press(getByTestId('fiestas-home-programme-open'));
    expect(router.push).toHaveBeenCalledWith('/villa/fiestas/2026');
  });

  it('asks a member to date fiestas due this month', () => {
    mockFiestas.mockReturnValue({ fiestas: [santiago], editions: [], status: 'ready', error: null });
    const { getByTestId } = render(<FiestasHomeCard municipalityId="m1" villageSlug="villa" isMember />);
    expect(getByTestId('fiestas-home-propose')).toBeTruthy();
    fireEvent.press(getByTestId('fiestas-home-propose-open'));
    expect(router.push).toHaveBeenCalledWith('/villa/fiestas/2026?fechas=santiago');
  });

  it('says nothing until its data is in, or when there is nothing to say', () => {
    mockFiestas.mockReturnValue({ fiestas: [santiago], editions: [], status: 'loading', error: null });
    expect(render(<FiestasHomeCard municipalityId="m1" villageSlug="villa" isMember />).toJSON()).toBeNull();
    mockFiestas.mockReturnValue({ fiestas: [santiago], editions: [], status: 'ready', error: null });
    expect(render(<FiestasHomeCard municipalityId="m1" villageSlug="villa" isMember={false} />).toJSON()).toBeNull();
  });
});
