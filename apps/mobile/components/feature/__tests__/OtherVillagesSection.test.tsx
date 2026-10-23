import { fireEvent, render, screen } from '@testing-library/react-native';
import { OtherVillagesSection } from '../OtherVillagesSection';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

type Emit = (rows: unknown[]) => void;
const mockWatch = jest.fn();
jest.mock('@cultuvilla/shared/services/villageRankingService', () => ({
  watchRankedVillages: (...a: unknown[]) => mockWatch(...a),
}));

jest.mock('../../../lib/i18n', () => ({
  useT: () => ({
    t: (key: string) =>
      ({ 'village.otherVillages.title': 'Descubre otros pueblos', 'village.otherVillages.seeAll': 'Ver todos' })[key] ??
      key,
  }),
}));

const ranked = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  province: 'Segovia',
  escudoUrl: null,
  manualEscudo: false,
  score: 1,
});

function answerWith(rows: unknown[]) {
  mockWatch.mockImplementation((next: Emit) => {
    next(rows);
    return () => undefined;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('OtherVillagesSection', () => {
  it('hides itself before the ranking exists', () => {
    answerWith([]);
    render(<OtherVillagesSection municipalityId="m1" />);
    expect(screen.queryByText('Descubre otros pueblos')).toBeNull();
  });

  it('shows the top five other pueblos in ranked order, never the one being viewed', () => {
    answerWith(['Aquí', 'Alfa', 'Beta', 'Gamma', 'Delta', 'Épsilon', 'Zeta'].map((n, i) => ranked(`m${String(i + 1)}`, n)));
    render(<OtherVillagesSection municipalityId="m1" />);

    const names = screen.getAllByText(/^(Aquí|Alfa|Beta|Gamma|Delta|Épsilon|Zeta)$/).map((n) => n.props.children);
    expect(names).toEqual(['Alfa', 'Beta', 'Gamma', 'Delta', 'Épsilon']);
  });

  it("opens a pueblo's page, and the header link opens the directory", () => {
    answerWith([ranked('m2', 'Alfa')]);
    render(<OtherVillagesSection municipalityId="m1" />);

    fireEvent.press(screen.getByText('Alfa'));
    expect(mockPush).toHaveBeenLastCalledWith('/alfa');

    fireEvent.press(screen.getByText('Ver todos'));
    expect(mockPush).toHaveBeenLastCalledWith('/descubrir');
  });
});
