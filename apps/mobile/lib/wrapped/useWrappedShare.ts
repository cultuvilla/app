import { useCallback } from 'react';
import { getWrappedLink } from '@cultuvilla/shared/services/deepLinkService';
import { useShareDeepLink } from '../deeplink/useShareDeepLink';
import { showAlert } from '../dialogs';
import { useT } from '../i18n';
import { canShareCardImage, shareCardImage } from './shareCardImage';
import type { StoryCard } from '../../components/feature/wrapped/WrappedStoryViewer';

/**
 * The two ways a published Wrapped leaves the app: its link (which previews as
 * the cover card) and a single card as an image. `shareCard` is undefined
 * where a card cannot be shared as a file.
 */
export function useWrappedShare(wrapped: { villageSlug: string; villageName: string; year: number }): {
  shareLink: () => void;
  shareCard: ((card: StoryCard) => void) | undefined;
} {
  const { t } = useT();
  const shareDeepLink = useShareDeepLink();
  const { villageSlug, villageName, year } = wrapped;

  const shareLink = useCallback(() => {
    void shareDeepLink(
      getWrappedLink(villageSlug, year),
      t('village.wrapped.viewer.shareName', { name: villageName, year: String(year) }),
    );
  }, [shareDeepLink, t, villageSlug, villageName, year]);

  const shareCard = useCallback(
    (card: StoryCard) => {
      shareCardImage(card.url, `${villageSlug}-fiestas-${String(year)}-${card.card}`).catch(() => {
        showAlert(t('village.wrapped.viewer.shareFailed'));
      });
    },
    [t, villageSlug, year],
  );

  return { shareLink, shareCard: canShareCardImage ? shareCard : undefined };
}
