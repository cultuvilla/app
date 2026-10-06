import { getVillageSlug } from '@cultuvilla/shared/services/municipalityService';
import { newsHref } from '../../lib/navigation/routes';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Screen, VStack, Text, Input, Button, FieldLabel, ImagePickerField, Pressable } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { OrganizerPicker } from '../../components/feature/OrganizerPicker';
import { Stepper, type StepConfig } from '../../components/feature/Stepper';
import { DeleteHeaderButton } from '../../components/feature/DeleteHeaderButton';
import {
  BlockEditor,
  editorBlockToNewsText,
  emptyTextBlock,
  newBlockId,
  newsTextToEditorBlock,
  type EditorBlock,
  type EditorImageBlock,
} from '../../components/feature/BlockEditor';
import { pickImageWithSize } from '../../lib/images';
import { useAuth } from '../../lib/auth/useAuth';
import { useEntityCapabilities } from '../../lib/auth/useEntityCapabilities';
import { useT } from '../../lib/i18n';
import { useCallable } from '../../lib/useCallable';
import { useMentionSources } from '../../lib/useMentionSources';
import { createNewsPost, updateNewsPost, getNewsPost, deleteNewsPost } from '@cultuvilla/shared/services/newsService';
import { uploadNewsImage, newsImageDownloadURL } from '@cultuvilla/shared/services/imageService';
import {
  NEWS_POST_CATEGORIES,
  type NewsPostCategory,
  type NewsPostImage,
  type NewsBlock,
} from '@cultuvilla/shared/models/news/NewsPostDataModel';

// The dedicated card cover: either a freshly-picked image (uploaded on submit)
// or one already in Storage (edit mode), or none.
type CoverState =
  | { kind: 'new'; blob: Blob; uri: string; contentType: string; width: number; height: number }
  | { kind: 'existing'; storagePath: string; uri: string; width: number; height: number }
  | null;

function stepBody(children: React.ReactNode) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** Flatten the text blocks into the legacy plain-text `body` (search/previews). */
function flattenBody(blocks: EditorBlock[]): string {
  return blocks
    .filter((b): b is Exclude<EditorBlock, EditorImageBlock> => b.type !== 'image')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

const ACCENT = colors.light.fg.accent;

/**
 * Category selector as a collapsible inline dropdown — a bordered field showing
 * the current choice that expands the option list below it. Inline (not a
 * `Modal`/native `Picker`) to stay safe on the web build (see mobile-web-compat).
 */
function CategoryField({
  value,
  onChange,
  t,
}: {
  value: NewsPostCategory | null;
  onChange: (c: NewsPostCategory) => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <VStack gap={1}>
      <FieldLabel>{t('news.compose.categoryLabel')}</FieldLabel>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={t('news.compose.categoryLabel')}
        testID="news-category"
        className="flex-row items-center justify-between border rounded-md px-3 py-3 bg-surface border-subtle"
      >
        <Text tone={value ? 'primary' : 'muted'}>
          {value ? t(`news.compose.category.${value}`) : t('news.compose.categoryPlaceholder')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={ACCENT} />
      </Pressable>
      {open ? (
        <VStack gap={0} className="overflow-hidden rounded-md border border-subtle bg-surface-elevated">
          {NEWS_POST_CATEGORIES.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => {
                onChange(opt);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: value === opt }}
              testID={`news-category-${opt}`}
              className={`flex-row items-center justify-between px-3 py-3 ${value === opt ? 'bg-surface' : ''}`}
            >
              <Text>{t(`news.compose.category.${opt}`)}</Text>
              {value === opt ? <Ionicons name="checkmark" size={18} color={ACCENT} /> : null}
            </Pressable>
          ))}
        </VStack>
      ) : null}
    </VStack>
  );
}

/**
 * Cover picker that shows the picked image IN FULL (at its natural aspect ratio,
 * never cropped) — the box matches the image's ratio so nothing is trimmed.
 * Empty state falls back to the shared dashed "add" card.
 */
function CoverField({
  cover,
  onPick,
  t,
}: {
  cover: CoverState;
  onPick: () => void;
  t: (key: string) => string;
}) {
  return (
    <VStack gap={1}>
      <FieldLabel>{t('news.compose.coverLabel')}</FieldLabel>
      {cover?.uri ? (
        <Pressable onPress={onPick} accessibilityLabel={t('news.compose.coverLabel')}>
          <View
            className="overflow-hidden rounded-2xl border border-subtle bg-surface"
            style={{ width: '100%', aspectRatio: cover.width > 0 && cover.height > 0 ? cover.width / cover.height : 16 / 9 }}
          >
            <Image
              source={{ uri: cover.uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          </View>
        </Pressable>
      ) : (
        <ImagePickerField uri={null} width="100%" height={160} label={t('news.compose.addCover')} onPress={onPick} />
      )}
    </VStack>
  );
}

export default function NewNewsScreen() {
  const { user, profile } = useAuth();
  const { t } = useT();
  // A `newsId` param puts this screen in edit mode: it loads that article and
  // prefills the form, saving via updateNewsPost. Otherwise it composes a new
  // article. A `villageId` param (e.g. from a village's "Artículos" add card)
  // targets that village; otherwise fall back to the user's active one.
  const { villageId, newsId } = useLocalSearchParams<{ villageId?: string; newsId?: string }>();
  const editMode = !!newsId;

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<NewsPostCategory | null>(null);
  const [cover, setCover] = useState<CoverState>(null);
  const [blocks, setBlocks] = useState<EditorBlock[]>([emptyTextBlock()]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(editMode);
  // In edit mode the municipality comes from the loaded article. Organizers stay
  // editable (any current organizer may reattribute the post), so the picker is
  // shown in both modes — just without the creator lock outside of create.
  const [editMunicipalityId, setEditMunicipalityId] = useState<string | null>(null);
  const [villageSlug, setVillageSlug] = useState('');

  const municipalityId = editMode ? editMunicipalityId : (villageId ?? profile?.activeMunicipalityId ?? null);
  const { canEdit, loading: capLoading } = useEntityCapabilities(municipalityId ?? undefined);

  // The article's URL is built from its pueblo's slug. In edit mode it comes off
  // the post; when writing a new one, resolve it from the pueblo being posted to.
  useEffect(() => {
    if (!municipalityId || villageSlug) return;
    let cancelled = false;
    void getVillageSlug(municipalityId).then((slug) => {
      if (!cancelled) setVillageSlug(slug);
    });
    return () => {
      cancelled = true;
    };
  }, [municipalityId, villageSlug]);
  const [organizerUserIds, setOrganizerUserIds] = useState<string[]>([]);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [organizerOrgIds, setOrganizerOrgIds] = useState<string[]>([]);

  const { candidates } = useMentionSources(municipalityId, newsId);

  // Auto-seed the creator as an organizer when composing a new article.
  useEffect(() => {
    if (!user || editMode) return;
    setOrganizerUserIds((prev) => (prev.includes(user.uid) ? prev : [user.uid, ...prev]));
  }, [user, editMode]);

  // ── Edit mode: load the article and prefill the form ──────────────────────
  useEffect(() => {
    if (!editMode || !newsId) return;
    let cancelled = false;
    void (async () => {
      const post = await getNewsPost(newsId);
      if (cancelled || !post) {
        if (!cancelled) setLoading(false);
        return;
      }
      setTitle(post.title);
      setCategory(post.category);
      setEditMunicipalityId(post.municipalityId);
      setVillageSlug(post.villageSlug);
      setOrganizerUserIds(post.organizerUserIds);
      setCreatedBy(post.createdBy);
      setOrganizerOrgIds(post.organizerOrgIds);

      // Cover: dedicated coverImage, else legacy images[0].
      const coverSrc = post.coverImage ?? post.images[0] ?? null;
      if (coverSrc) {
        const uri = await newsImageDownloadURL(coverSrc.storagePath);
        if (!cancelled) {
          setCover({ kind: 'existing', storagePath: coverSrc.storagePath, uri, width: coverSrc.width, height: coverSrc.height });
        }
      }

      // Blocks from content; fall back to a single text block from legacy body.
      const editorBlocks: EditorBlock[] = post.content.length
        ? await Promise.all(
            post.content.map(async (b): Promise<EditorBlock> => {
              if (b.type === 'text') return newsTextToEditorBlock(b);
              const uri = await newsImageDownloadURL(b.storagePath);
              return {
                id: newBlockId(),
                type: 'image',
                storagePath: b.storagePath,
                blob: null,
                uri,
                width: b.width,
                height: b.height,
                caption: b.caption ?? '',
                captionMentions: b.captionMentions,
                captionLinks: b.captionLinks,
                captionMarks: b.captionMarks,
              };
            }),
          )
        : [{ id: newBlockId(), type: 'text', text: post.body, mentions: [], links: [], marks: [] }];

      if (!cancelled) {
        setBlocks(editorBlocks.length ? editorBlocks : [emptyTextBlock()]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editMode, newsId]);

  const hasContent = blocks.some((b) => b.type === 'text' && b.text.trim().length > 0);

  async function pickCover() {
    const picked = await pickImageWithSize();
    if (!picked) return;
    setCover({
      kind: 'new',
      blob: picked.blob,
      uri: picked.previewUri ?? '',
      contentType: picked.contentType ?? 'image/jpeg',
      width: picked.width,
      height: picked.height,
    });
  }

  const { fire: submit, isPending } = useCallable({
    callable: async () => {
      if (!municipalityId || !user || !category) return;

      const body = flattenBody(blocks);
      const targetId = editMode && newsId ? newsId : null;

      // Create the doc first (image storage paths are keyed by post id), then
      // upload any new images and patch the assembled content + cover in.
      const postId =
        targetId ??
        (await createNewsPost({
          municipalityId,
          createdBy: user.uid,
          organizerUserIds,
          organizerOrgIds,
          title: title.trim(),
          body,
          category,
        }));

      // Upload new inline images and assemble the final content array in order.
      const content: NewsBlock[] = [];
      for (const [i, block] of blocks.entries()) {
        if (block.type !== 'image') {
          if (block.text.trim().length === 0) continue;
          content.push(editorBlockToNewsText(block));
          continue;
        }
        let storagePath = block.storagePath;
        if (!storagePath && block.blob) {
          storagePath = await uploadNewsImage(postId, {
            blob: block.blob,
            filename: `news-block-${i}.jpg`,
            contentType: block.blob.type || 'image/jpeg',
          });
        }
        if (storagePath) {
          content.push({
            type: 'image',
            storagePath,
            width: block.width,
            height: block.height,
            caption: block.caption.trim() || null,
            captionMentions: block.captionMentions,
            captionLinks: block.captionLinks,
            captionMarks: block.captionMarks,
          });
        }
      }

      // Cover: upload if freshly picked, else reuse the existing storage path.
      let coverImage: NewsPostImage | null = null;
      if (cover?.kind === 'new') {
        const storagePath = await uploadNewsImage(postId, {
          blob: cover.blob,
          filename: 'news-cover.jpg',
          contentType: cover.contentType,
        });
        coverImage = { storagePath, width: cover.width, height: cover.height };
      } else if (cover?.kind === 'existing') {
        coverImage = { storagePath: cover.storagePath, width: cover.width, height: cover.height };
      }

      await updateNewsPost(postId, {
        title: title.trim(),
        body,
        content,
        category,
        coverImage,
        // Authorship was already set on create; only re-persist it when editing,
        // where the organizer picker may have reassigned it.
        ...(editMode ? { organizerUserIds, organizerOrgIds } : {}),
      });
      return postId;
    },
    onSuccess: (postId) => {
      if (editMode) {
        if (postId) router.replace(newsHref({ id: postId, title, villageSlug }));
      } else {
        setSubmitted(true);
      }
    },
    swallow: true,
  });

  const headerTitle = editMode ? t('news.compose.editTitle') : t('news.compose.title');

  // Hard delete via the cascading callable; the guard below is what makes
  // "reaching edit mode" mean author, co-organizer or admin.
  const remove = () => {
    if (!newsId) return;
    return deleteNewsPost(newsId).then(() => router.replace('/(tabs)'));
  };

  // Editing is gated exactly like every other entity's edit screen (and like
  // the news update rules); anyone else who deep-links here goes to the article.
  if (editMode && !loading && !capLoading && !canEdit(createdBy, organizerUserIds)) {
    return <Redirect href={newsHref({ id: newsId, title, villageSlug })} />;
  }

  if (loading) {
    return (
      <Screen padded={false}>
        <ScreenHeader title={headerTitle} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!municipalityId) {
    return (
      <Screen padded={false}>
        <ScreenHeader title={headerTitle} />
        <View className="flex-1 items-center justify-center px-8">
          <Text tone="muted" className="text-center">
            {t('news.compose.needsMembership')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen padded={false}>
        <ScreenHeader title={headerTitle} />
        <View className="flex-1 items-center justify-center px-8">
          <VStack gap={4} className="items-center">
            <Ionicons name="checkmark-circle-outline" size={48} color="#16a34a" />
            <Text className="text-center">{t('news.compose.successPublished')}</Text>
            <Button onPress={() => router.back()}>{t('common.back')}</Button>
          </VStack>
        </View>
      </Screen>
    );
  }

  const steps: StepConfig[] = [
    {
      key: 'basics',
      title: t('news.compose.stepBasics'),
      icon: 'create-outline',
      validate: () => {
        const e: string[] = [];
        if (!title.trim()) e.push('title');
        if (!category) e.push('category');
        return e;
      },
      render: () =>
        stepBody(
          <>
            <Input
              label={t('news.compose.titleLabel')}
              value={title}
              onChangeText={setTitle}
              testID="news-title"
            />
            <CategoryField value={category} onChange={setCategory} t={t} />
            <CoverField cover={cover} onPick={pickCover} t={t} />
          </>,
        ),
    },
    {
      key: 'content',
      title: t('news.compose.stepContent'),
      icon: 'document-text-outline',
      validate: () => (hasContent ? [] : ['content']),
      render: () =>
        stepBody(
          <>
            <FieldLabel>{t('news.compose.contentLabel')}</FieldLabel>
            <BlockEditor
              blocks={blocks}
              onChange={setBlocks}
              candidates={candidates}
              textTestIDPrefix="news-block-text"
            />
          </>,
        ),
    },
    {
      key: 'attribution',
      title: t('news.compose.stepAttribution'),
      icon: 'people-outline',
      render: () =>
        stepBody(
          municipalityId && user ? (
            <OrganizerPicker
              municipalityId={municipalityId}
              selectedUserIds={organizerUserIds}
              selectedOrgIds={organizerOrgIds}
              // Lock the creator into the set only while composing; in edit mode
              // authorship is fully reassignable by any current organizer.
              lockedUserId={editMode ? undefined : user.uid}
              onChangeUsers={setOrganizerUserIds}
              onChangeOrgs={setOrganizerOrgIds}
              peopleLabel={t('news.compose.writersLabel')}
              addPersonLabel={t('news.compose.addWriter')}
              selectPeopleTitle={t('news.compose.selectWriters')}
            />
          ) : null,
        ),
    },
  ];

  // bottomInset={false}: the Stepper's own bottom nav bar applies the inset.
  return (
    <Screen padded={false} bottomInset={false}>
      <ScreenHeader
        title={headerTitle}
        rightSlot={
          editMode ? (
            <DeleteHeaderButton
              onConfirm={remove}
              accessibilityLabel={t('common.delete')}
              confirmTitle={t('common.deleteConfirmTitle')}
              confirmMessage={t('common.deleteConfirmMessage')}
              confirmLabel={t('common.delete')}
              cancelLabel={t('common.cancel')}
              deletingLabel={t('common.deleting.news')}
              testID="news-delete"
            />
          ) : undefined
        }
      />
      <View style={{ flex: 1 }}>
        <Stepper
          steps={steps}
          onComplete={() => void submit()}
          submitLabel={editMode ? t('common.save') : t('news.compose.submit')}
          loading={isPending}
          allStepsReachable={editMode}
          primaryTestID="news-form-primary"
        />
      </View>
    </Screen>
  );
}
