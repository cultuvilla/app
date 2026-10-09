import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { Text } from '../../../components/primitives/Text';
import { HStack } from '../../../components/primitives/HStack';
import { EntityDetailScaffold } from '../../../components/feature/EntityDetailScaffold';
import type { EntityDetailAction } from '../../../components/feature/EntityDetailHeader';
import { ENTITY_FALLBACK_ICON } from '../../../lib/entities/registry';
import { NewsContentRenderer } from '../../../components/feature/NewsContentRenderer';
import { LiveOwnerChip } from '../../../components/feature/LiveOwnerChip';
import { openOwner } from '../../../lib/entities/ownerRoute';
import { EntityComments } from '../../../components/feature/EntityComments';
import { useEntityCapabilities } from '../../../lib/auth/useEntityCapabilities';
import { useT } from '../../../lib/i18n';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useShareDeepLink } from '../../../lib/deeplink/useShareDeepLink';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { getNewsLink } from '@cultuvilla/shared/services/deepLinkService';
import { parseEntityRef } from '@cultuvilla/shared/utils';
import { createNewsHref } from '../../../lib/navigation/routes';
import { watchNewsPost } from '@cultuvilla/shared/services/newsService';
import { recordEntityView } from '@cultuvilla/shared/services/commentsService';
import { newsImageDownloadURL } from '@cultuvilla/shared/services/imageService';
import { formatDate } from '@cultuvilla/shared/utils';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';

type Post = NewsPostData & { id: string };

export default function NewsDetailScreen() {
  const { noticia } = useLocalSearchParams<{ noticia: string }>();
  const newsId = parseEntityRef(noticia ?? '') ?? '';
  const { t } = useT();
  const share = useShareDeepLink();
  const { data: post = null, status } = useWatch<Post | null>(
    'newsDetail:watchNewsPost',
    newsId || null,
    (next, error) => watchNewsPost(newsId, next, error),
  );
  const loading = status === 'loading';
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const { canManage, canEdit } = useEntityCapabilities(post?.municipalityId);

  // Resolve the cover to a download URL. Prefer the dedicated coverImage; fall
  // back to legacy images[0] for posts authored before covers existed.
  const firstImagePath = post?.coverImage?.storagePath ?? post?.images[0]?.storagePath ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!firstImagePath) {
      setImageUrl(null);
      return;
    }
    newsImageDownloadURL(firstImagePath)
      .then((url) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firstImagePath]);

  useEffect(() => {
    if (!post) return;
    void recordEntityView({ entityKind: 'news', entityId: post.id, municipalityId: post.municipalityId });
    observability.trackEvent(OBSERVABILITY_EVENTS.CONTENT_DETAIL_VIEWED, {
      entityKind: 'news',
      entityId: post.id,
      municipalityId: post.municipalityId,
    });
  }, [post?.id]);

  const date = post ? (post.publishedAt ?? post.createdAt) : null;
  const editable = !!post && canEdit(post.createdBy, post.organizerUserIds);

  const actions: EntityDetailAction[] = post
    ? [
        ...(editable
          ? [
              {
                icon: 'create-outline' as const,
                testID: 'news-edit-action',
                accessibilityLabel: t('news.compose.editTitle'),
                onPress: () => router.push(createNewsHref({ newsId: post.id })),
              },
            ]
          : []),
        {
          icon: 'share-outline',
          testID: 'news-share-action',
          accessibilityLabel: t('deeplink.shareViewLabel'),
          onPress: () => void share(getNewsLink(post), post.title),
        },
      ]
    : [];

  return (
    <EntityDetailScaffold
      loading={loading}
      notFound={!loading && !post}
      imageUri={imageUrl}
      fallbackIcon={ENTITY_FALLBACK_ICON.news}
      actions={actions}
      title={post?.title}
    >
      {post ? (
        <>
          {post.organizerOrgIds.map((id) => (
            <LiveOwnerChip
              key={id}
              ownerId={id}
              ownerType="organization"
              size={28}
              tone="muted"
              onPress={() => void openOwner('organization', id)}
            />
          ))}
          {post.organizerUserIds.map((id) => (
            <LiveOwnerChip
              key={id}
              ownerId={id}
              ownerType="user"
              size={28}
              tone="muted"
              onPress={() => void openOwner('user', id)}
            />
          ))}
          <HStack gap={2} justify="between">
            <Text tone="muted">{t(`news.compose.category.${post.category}`)}</Text>
            {date ? <Text tone="muted">{formatDate(date, 'long')}</Text> : null}
          </HStack>
          <NewsContentRenderer content={post.content} body={post.body} villageSlug={post.villageSlug} />
          <EntityComments
            key={post.id}
            entityKind="news"
            entityId={post.id}
            municipalityId={post.municipalityId}
            canModerate={canManage}
          />
        </>
      ) : null}
    </EntityDetailScaffold>
  );
}
