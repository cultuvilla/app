import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Text } from '../../primitives';
import { EntityCard } from '../VillageSections';
import { newsImageDownloadURL } from '@cultuvilla/shared/services/imageService';
import { formatDate } from '@cultuvilla/shared/utils';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';

export type CreatedNews = NewsPostData & { id: string };

export interface CreatedNewsScrollProps {
  news: CreatedNews[];
  emptyLabel: string;
  onPressNews: (post: CreatedNews) => void;
}

export function CreatedNewsScroll({ news, emptyLabel, onPressNews }: CreatedNewsScrollProps) {
  if (news.length === 0) {
    return (
      <View className="px-4">
        <Text tone="muted">{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      data={news}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      renderItem={({ item }) => (
        <NewsScrollCard post={item} onPress={() => onPressNews(item)} />
      )}
    />
  );
}

// News images are Storage paths (not plain URLs like events), so resolve the
// first one asynchronously before handing it to <EntityCard>.
function NewsScrollCard({ post, onPress }: { post: CreatedNews; onPress: () => void }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const firstImagePath = post.coverImage?.storagePath ?? post.images[0]?.storagePath ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!firstImagePath) {
      setImageUri(null);
      return;
    }
    newsImageDownloadURL(firstImagePath)
      .then((url) => {
        if (!cancelled) setImageUri(url);
      })
      .catch(() => {
        if (!cancelled) setImageUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [firstImagePath]);

  return (
    <EntityCard
      label={post.title}
      sub={formatDate(post.publishedAt ?? post.createdAt, 'short')}
      icon="newspaper-outline"
      imageUri={imageUri}
      onPress={onPress}
    />
  );
}
