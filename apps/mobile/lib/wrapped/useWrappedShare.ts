import { useCallback } from 'react';
import { getWrappedLink } from '@cultuvilla/shared/services/deepLinkService';
import { useShareDeepLink } from '../deeplink/useShareDeepLink';
import { showAlert } from '../dialogs';
import { useT } from '../i18n';
import { canShareCardImage, saveCardImage, shareCardImage } from './shareCardImage';
import type { StoryCard } from '../../components/feature/wrapped/WrappedStoryViewer';

/**
 * The ways a published Wrapped leaves the app: its link (which previews as the
 * cover card), a single card as an image, and a single card saved to the photo
 * library. `shareCard` and `saveCard` are undefined where a card cannot be
 * handled as a file.
 */
export function useWrappedShare(wrapped: { villageSlug: string; villageName: string; year: number }): {
  shareLink: () => void;
  shareCard: ((card: StoryCard) => void) | undefined;
  saveCard: ((card: StoryCard) => void) | undefined;
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

  const saveCard = useCallback(
    (card: StoryCard) => {
      const baseName = `${villageSlug}-fiestas-${String(year)}-${card.card}`;
      saveCardImage(card.url, baseName)
        .then((result) => {
          showAlert(t(result === 'saved' ? 'village.wrapped.viewer.saved' : 'village.wrapped.viewer.saveDenied'));
        })
        .catch(() => {
          showAlert(t('village.wrapped.viewer.saveFailed'));
        });
    },
    [t, villageSlug, year],
  );

  return {
    shareLink,
    shareCard: canShareCardImage ? shareCard : undefined,
    saveCard: canShareCardImage ? saveCard : undefined,
  };
}
