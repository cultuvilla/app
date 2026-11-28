import { render } from '@testing-library/react-native';
import { NewsCard, type NewsLike } from '../NewsCard';

// Stub i18n so the card never needs a provider (matches EventCard.test).
jest.mock('../../../lib/i18n', () => ({
  useT: () => ({ locale: 'es', t: (k: string) => k }),
}));

// The card resolves its cover image through imageService; keep it deterministic.
jest.mock('@cultuvilla/shared/services/imageService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/imageService')>(
      '@cultuvilla/shared/services/imageService',
      () => ({
        newsImageDownloadURL: jest.fn(() => Promise.resolve('https://example.test/cover.jpg')),
      }),
    ),
);

const fixture: NewsLike = {
  id: 'n1',
  title: 'Programa de fiestas',
  category: 'fiesta',
  publishedAt: new Date('2026-06-15T18:00:00Z'),
  createdAt: new Date('2026-06-10T18:00:00Z'),
  images: [],
};

describe('<NewsCard>', () => {
  it('shows the comment count (not a date) when the article has comments', () => {
    const { getByTestId, getByText, queryByText } = render(
      <NewsCard post={{ ...fixture, commentCount: 4 }} onPress={() => {}} />,
    );
    expect(getByTestId('feed-card-comment-count')).toBeTruthy();
    expect(getByText('4')).toBeTruthy();
    // No date is rendered — jun/2026 relative labels must be absent.
    expect(queryByText(/jun/i)).toBeNull();
  });

  it('shows nothing on the right when the article has no comments', () => {
    const { queryByTestId } = render(
      <NewsCard post={{ ...fixture, commentCount: 0 }} onPress={() => {}} />,
    );
    expect(queryByTestId('feed-card-comment-count')).toBeNull();
  });
});
