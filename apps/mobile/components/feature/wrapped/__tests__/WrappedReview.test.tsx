import { fireEvent, render } from '@testing-library/react-native';
import { WrappedReview } from '../WrappedReview';

const mockShareLink = jest.fn();
const mockShareCard = jest.fn();
const mockViewer = jest.fn();

jest.mock('../../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));
jest.mock('../../../../lib/wrapped/useWrappedShare', () => ({
  useWrappedShare: () => ({ shareLink: mockShareLink, shareCard: mockShareCard }),
}));
jest.mock('../WrappedStoryViewer', () => ({
  WrappedStoryViewer: (props: unknown) => {
    mockViewer(props);
    return null;
  },
}));

const IMAGES = { cover: 'https://x/cover.png', stats: 'https://x/stats.png' };

function review(status: 'draft' | 'published') {
  return render(
    <WrappedReview
      wrapped={{ status, images: IMAGES, autoPublishAt: null, villageName: 'Anaya', year: 2026 }}
      villageSlug="anaya"
      onPublish={jest.fn()}
      onDiscard={jest.fn()}
      deciding={false}
    />,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('WrappedReview', () => {
  it('lets a draft cover be saved or shared as an image', () => {
    const { getByTestId } = review('draft');
    fireEvent.press(getByTestId('wrapped-share-cover'));
    expect(mockShareCard).toHaveBeenCalledWith({ card: 'cover', url: IMAGES.cover });
  });

  it('keeps the link back until the Wrapped is published, since until then it leads nowhere', () => {
    const draft = review('draft');
    fireEvent.press(draft.getByTestId('wrapped-preview'));
    expect(mockViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ onShareLink: undefined, onShareCard: mockShareCard }),
    );
    draft.unmount();

    const published = review('published');
    fireEvent.press(published.getByTestId('wrapped-preview'));
    expect(mockViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({ onShareLink: mockShareLink, onShareCard: mockShareCard }),
    );
  });
});
