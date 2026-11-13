import { fireEvent, render } from '@testing-library/react-native';
import { VillageCosatecaEntry } from '../cosateca/VillageCosatecaEntry';

const mockPush = jest.fn();
let mockCosas: unknown[] = [];
const mockUseWatch = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@cultuvilla/shared/services/cosatecaService', () => ({ watchVillageCosas: jest.fn() }));
jest.mock('../../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string, v?: Record<string, unknown>) => (v ? `${k}:${String(v.count)}` : k) }),
}));
jest.mock('../../../../lib/hooks/useWatch', () => ({
  useWatch: (label: string, key: string | null) => {
    mockUseWatch(label, key);
    return { data: key ? mockCosas : undefined, status: 'ready' };
  },
}));

const cosa = (id: string, status: string) => ({ id, title: id, category: 'otros', status });

beforeEach(() => {
  jest.clearAllMocks();
  mockCosas = [cosa('a', 'available'), cosa('b', 'paused'), cosa('c', 'given')];
});

describe('VillageCosatecaEntry', () => {
  it('leads a village member to the Cosateca del pueblo, counting what is still in it', () => {
    const { getByTestId } = render(<VillageCosatecaEntry municipalityId="m1" villageSlug="anaya" isMember />);
    expect(getByTestId('village-cosateca-entry')).toHaveTextContent(/groups\.cosateca\.village\.entry:2/);
    fireEvent.press(getByTestId('village-cosateca-entry'));
    expect(mockPush).toHaveBeenCalledWith('/anaya/cosateca');
  });

  it('is not there for someone outside the village, who could not read it, nor when it is empty', () => {
    const outsider = render(<VillageCosatecaEntry municipalityId="m1" villageSlug="anaya" isMember={false} />);
    expect(outsider.queryByTestId('village-cosateca-entry')).toBeNull();
    expect(mockUseWatch).toHaveBeenCalledWith('cosateca:watchVillageCosas', null);
    outsider.unmount();
    mockCosas = [cosa('c', 'given')];
    expect(render(<VillageCosatecaEntry municipalityId="m1" villageSlug="anaya" isMember />).queryByTestId('village-cosateca-entry')).toBeNull();
  });
});
