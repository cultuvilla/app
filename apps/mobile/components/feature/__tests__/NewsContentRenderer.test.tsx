import { render } from '@testing-library/react-native';
import type { NewsBlock } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { NewsContentRenderer } from '../NewsContentRenderer';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@cultuvilla/shared/services/imageService', () =>
  jest
    .requireActual<typeof import('../../../test/fakeModule')>('../../../test/fakeModule')
    .fakeService<typeof import('@cultuvilla/shared/services/imageService')>(
      '@cultuvilla/shared/services/imageService',
      () => ({
        newsImageDownloadURL: jest.fn().mockResolvedValue(null),
      }),
    ),
);

const text = (value: string, style: 'paragraph' | 'section' | 'subsection'): NewsBlock => ({
  type: 'text', text: value, mentions: [], links: [], marks: [], style,
});

describe('<NewsContentRenderer> sections', () => {
  it('renders section and subsection blocks as headers at their own size', () => {
    const { getByText, getAllByRole } = render(
      <NewsContentRenderer
        content={[text('Programa', 'section'), text('Sábado', 'subsection'), text('Misa a las 12', 'paragraph')]}
        body=""
        villageSlug="villa"
      />,
    );
    expect(getAllByRole('header').map((h) => h.props.children)).toEqual(['Programa', 'Sábado']);
    expect(getByText('Programa').props.className).toContain('text-h2');
    expect(getByText('Sábado').props.className).toContain('text-h3');
    expect(getByText('Misa a las 12').props.accessibilityRole).toBeUndefined();
  });
});
