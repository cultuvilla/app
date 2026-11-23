import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Editor } from '@tiptap/react';
import {
  NEWS_POST_CATEGORIES,
  type NewsPostCategory,
  type NewsPostData,
  type NewsPostImage,
} from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { newsBlocksToDoc, newsDocToBlocks, type NewsDoc } from '@cultuvilla/shared/models/news/newsDocument';
import { flattenNewsBody } from '@cultuvilla/shared/models/news/newsEditorBlocks';
import { newsImageDownloadURL, uploadNewsImage } from '@cultuvilla/shared/services/imageService';
import {
  getMentionCandidates,
  type MentionCandidate,
} from '@cultuvilla/shared/services/mentionCandidateService';
import { createNewsPost, deleteNewsPost, getNewsPost, updateNewsPost } from '@cultuvilla/shared/services/newsService';
import { entityPath } from '@cultuvilla/shared/utils/urls';
import { useSignedInUser } from '../auth/StudioAuth';
import { useAsync } from '../data/useAsync';
import { myVillages, villageDirectory, villageName, type VillageDirectory } from '../data/villages';
import { NewsEditor } from '../editor/NewsEditor';
import { extensionFor, prepareImage, type PickedImage } from '../editor/images';
import { editorDoc, uploadPendingImages, withoutPendingImages } from '../editor/saveDoc';
import { siteOrigin } from '../firebase';
import { t } from '../i18n';
import { navigate } from '../router';

type Post = NewsPostData & { id: string };

type Cover =
  | { kind: 'existing'; image: NewsPostImage; url: string | null }
  | { kind: 'new'; image: PickedImage }
  | null;

type Field = 'village' | 'title' | 'category' | 'content';

interface Draft {
  municipalityId: string;
  title: string;
  category: NewsPostCategory | '';
  cover: Cover;
  organizerUserIds: string[];
  organizerOrgIds: string[];
}

/** The article to edit, or a blank one; null when it is missing or not the user's to edit. */
function useArticle(id: string | null, uid: string) {
  return useAsync<Post | null | 'new'>(id ?? 'new', async () => {
    if (!id) return 'new';
    const post = await getNewsPost(id);
    if (!post) return null;
    // The studio is for an article's own writers; admins edit from the app.
    return post.createdBy === uid || post.organizerUserIds.includes(uid) ? post : null;
  });
}

export function ArticleEditorScreen({ id }: { id: string | null }) {
  const user = useSignedInUser();
  const article = useArticle(id, user.uid);

  if (article.status === 'loading') return <main className="page muted">{t('common.loading')}</main>;
  if (article.status === 'error' || article.value === null) {
    return (
      <main className="page">
        <BackLink />
        <p className="notice">{t('studio.web.editor.notFound')}</p>
      </main>
    );
  }
  const post = article.value === 'new' ? null : article.value;
  return <ArticleForm key={post?.id ?? 'new'} post={post} uid={user.uid} />;
}

function BackLink() {
  return (
    <a
      className="back"
      href="/estudio"
      onClick={(e) => {
        e.preventDefault();
        navigate({ name: 'articles' });
      }}
    >
      ← {t('studio.web.editor.back')}
    </a>
  );
}

function ArticleForm({ post, uid }: { post: Post | null; uid: string }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    municipalityId: post?.municipalityId ?? '',
    title: post?.title ?? '',
    category: post?.category ?? '',
    cover: null,
    organizerUserIds: post?.organizerUserIds ?? [uid],
    organizerOrgIds: post?.organizerOrgIds ?? [],
  }));
  const [initialDoc] = useState<NewsDoc>(() => newsBlocksToDoc(post?.content ?? []));
  const editorRef = useRef<Editor | null>(null);
  // A new article that a failed save already created: the retry updates it.
  const createdId = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [missing, setMissing] = useState<Field[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const villages = useAsync(post ? null : uid, () => myVillages(uid));
  const directory = useAsync<VillageDirectory>(draft.municipalityId || null, () =>
    villageDirectory(draft.municipalityId),
  );
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);

  const change = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage(null);
  }, []);

  useEffect(() => {
    if (!draft.municipalityId) return;
    let cancelled = false;
    void getMentionCandidates(draft.municipalityId, post?.id).then((loaded) => {
      if (!cancelled) setCandidates(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [draft.municipalityId, post?.id]);

  // The cover of an existing article: its dedicated cover, else the legacy first image.
  useEffect(() => {
    const image = post?.coverImage ?? post?.images[0] ?? null;
    if (!image) return;
    setDraft((d) => ({ ...d, cover: { kind: 'existing', image, url: null } }));
    void newsImageDownloadURL(image.storagePath).then((url) =>
      setDraft((d) => (d.cover?.kind === 'existing' ? { ...d, cover: { ...d.cover, url } } : d)),
    );
  }, [post]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onEditorReady = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);
  const onEditorChange = useCallback(() => {
    setDirty(true);
    setMessage(null);
  }, []);
  const onImageError = useCallback(() => setMessage({ tone: 'error', text: t('studio.web.editor.error.image') }), []);

  async function pickCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      change({ cover: { kind: 'new', image: await prepareImage(file) } });
    } catch {
      onImageError();
    }
  }

  function validate(doc: NewsDoc): Field[] {
    const fields: Field[] = [];
    if (!draft.municipalityId) fields.push('village');
    if (!draft.title.trim()) fields.push('title');
    if (!draft.category) fields.push('category');
    const hasText = newsDocToBlocks(withoutPendingImages(doc)).some((b) => b.type === 'text');
    if (!hasText) fields.push('content');
    return fields;
  }

  async function save() {
    const editor = editorRef.current;
    if (!editor || saving) return;
    const invalid = validate(editorDoc(editor));
    setMissing(invalid);
    if (invalid.length > 0 || !draft.category) return;
    const category = draft.category;

    setSaving(true);
    setMessage(null);
    try {
      const title = draft.title.trim();
      // A post's images live under its id, so a new post is created first —
      // as the app does — and its images and content patched in.
      const postId =
        post?.id ??
        createdId.current ??
        (await createNewsPost({
          municipalityId: draft.municipalityId,
          createdBy: uid,
          organizerUserIds: draft.organizerUserIds,
          organizerOrgIds: draft.organizerOrgIds,
          title,
          body: flattenNewsBody(newsDocToBlocks(withoutPendingImages(editorDoc(editor)))),
          category,
        }));
      createdId.current = postId;

      await uploadPendingImages(editor, (image, i) =>
        uploadNewsImage(postId, {
          blob: image.blob,
          filename: `news-block-${i}.${extensionFor(image.contentType)}`,
          contentType: image.contentType,
        }),
      );
      const content = newsDocToBlocks(editorDoc(editor));

      let coverImage: NewsPostImage | null = null;
      if (draft.cover?.kind === 'new') {
        const { image } = draft.cover;
        const storagePath = await uploadNewsImage(postId, {
          blob: image.blob,
          filename: `news-cover.${extensionFor(image.contentType)}`,
          contentType: image.contentType,
        });
        coverImage = { storagePath, width: image.width, height: image.height };
        setDraft((d) => ({ ...d, cover: { kind: 'existing', image: coverImage as NewsPostImage, url: image.previewUrl } }));
      } else if (draft.cover?.kind === 'existing') {
        coverImage = draft.cover.image;
      }

      await updateNewsPost(postId, {
        title,
        body: flattenNewsBody(content),
        content,
        category,
        coverImage,
        // Authorship was set on create; an edit may have reassigned it.
        ...(post ? { organizerUserIds: draft.organizerUserIds, organizerOrgIds: draft.organizerOrgIds } : {}),
      });
      setDirty(false);
      setMessage({ tone: 'success', text: t('studio.web.editor.saved') });
      if (!post) navigate({ name: 'article', id: postId }, { replace: true });
    } catch {
      setMessage({ tone: 'error', text: t('studio.web.editor.error.save') });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!post || !window.confirm(t('studio.web.editor.deleteConfirm'))) return;
    try {
      await deleteNewsPost(post.id);
      setDirty(false);
      navigate({ name: 'articles' }, { replace: true });
    } catch {
      setMessage({ tone: 'error', text: t('studio.web.editor.error.delete') });
    }
  }

  const required = (field: Field) =>
    missing.includes(field) ? <p className="field-error">{t(`studio.web.editor.required.${field}`)}</p> : null;
  const coverUrl = draft.cover?.kind === 'new' ? draft.cover.image.previewUrl : (draft.cover?.url ?? null);
  const villageList = villages.status === 'ready' ? villages.value : [];

  return (
    <main className="page editor-page">
      <div className="editor-bar">
        <BackLink />
        <div className="editor-actions">
          {message ? <span className={`status ${message.tone}`}>{message.text}</span> : null}
          {dirty && !message ? <span className="status muted">{t('studio.web.editor.unsaved')}</span> : null}
          {post ? (
            <a
              className="button ghost"
              href={`${siteOrigin()}${entityPath('news', { id: post.id, title: draft.title || post.title, villageSlug: post.villageSlug })}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('studio.web.editor.view')}
            </a>
          ) : null}
          {post && post.createdBy === uid ? (
            <button type="button" className="button danger-ghost" onClick={() => void remove()}>
              {t('common.delete')}
            </button>
          ) : null}
          <button type="button" className="button primary" disabled={saving} onClick={() => void save()}>
            {saving ? t('studio.web.editor.saving') : post ? t('studio.web.editor.saveChanges') : t('studio.web.editor.publish')}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <article className="editor-main">
          <input
            className="title-input"
            value={draft.title}
            placeholder={t('studio.web.editor.titlePlaceholder')}
            aria-label={t('news.compose.titleLabel')}
            onChange={(e) => change({ title: e.target.value })}
          />
          {required('title')}
          <NewsEditor
            initialDoc={initialDoc}
            candidates={candidates}
            onReady={onEditorReady}
            onChange={onEditorChange}
            onImageError={onImageError}
          />
          {required('content')}
        </article>

        <aside className="editor-side">
          <label className="field">
            <span>{t('studio.web.editor.villageLabel')}</span>
            {post ? (
              <VillageName municipalityId={post.municipalityId} />
            ) : villages.status === 'ready' && villageList.length === 0 ? (
              <p className="muted small">{t('studio.web.editor.noVillages')}</p>
            ) : (
              <select
                value={draft.municipalityId}
                onChange={(e) =>
                  change({ municipalityId: e.target.value, organizerUserIds: [uid], organizerOrgIds: [] })
                }
              >
                <option value="">{t('studio.web.editor.villagePlaceholder')}</option>
                {villageList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          {required('village')}

          <label className="field">
            <span>{t('news.compose.categoryLabel')}</span>
            <select
              value={draft.category}
              onChange={(e) => change({ category: e.target.value as NewsPostCategory })}
            >
              <option value="">{t('news.compose.categoryPlaceholder')}</option>
              {NEWS_POST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`news.compose.category.${c}`)}
                </option>
              ))}
            </select>
          </label>
          {required('category')}

          <div className="field">
            <span>{t('news.compose.coverLabel')}</span>
            {coverUrl ? <img className="cover-preview" src={coverUrl} alt="" /> : null}
            <div className="row">
              <label className="button ghost">
                {draft.cover ? t('studio.web.editor.coverChange') : t('news.compose.addCover')}
                <input type="file" accept="image/*" hidden onChange={(e) => void pickCover(e)} />
              </label>
              {draft.cover ? (
                <button type="button" className="button ghost" onClick={() => change({ cover: null })}>
                  {t('studio.web.editor.coverRemove')}
                </button>
              ) : null}
            </div>
          </div>

          {draft.municipalityId ? (
            <Credits
              directory={directory.status === 'ready' ? directory.value : null}
              userIds={draft.organizerUserIds}
              orgIds={draft.organizerOrgIds}
              lockedUserId={post ? null : uid}
              onUsers={(organizerUserIds) => change({ organizerUserIds })}
              onOrgs={(organizerOrgIds) => change({ organizerOrgIds })}
            />
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function VillageName({ municipalityId }: { municipalityId: string }) {
  const name = useAsync(municipalityId, () => villageName(municipalityId));
  return <strong>{name.status === 'ready' ? name.value : ''}</strong>;
}

/**
 * Who the article is credited to: its writers and groups. The writer set
 * never empties — the rules refuse an article nobody is credited with — and
 * while composing, the author is locked in, as in the app.
 */
function Credits({
  directory,
  userIds,
  orgIds,
  lockedUserId,
  onUsers,
  onOrgs,
}: {
  directory: VillageDirectory | null;
  userIds: string[];
  orgIds: string[];
  lockedUserId: string | null;
  onUsers: (ids: string[]) => void;
  onOrgs: (ids: string[]) => void;
}) {
  const writerName = (id: string) => directory?.writers.find((w) => w.userId === id)?.name ?? '…';
  const groupName = (id: string) => directory?.groups.find((g) => g.id === id)?.name ?? '…';
  const canRemoveWriter = (id: string) => id !== lockedUserId && userIds.length > 1;

  return (
    <>
      <div className="field">
        <span>{t('news.compose.writersLabel')}</span>
        <ul className="chips">
          {userIds.map((id) => (
            <li key={id}>
              {writerName(id)}
              {canRemoveWriter(id) ? (
                <button
                  type="button"
                  aria-label={`${t('studio.web.editor.remove')} ${writerName(id)}`}
                  onClick={() => onUsers(userIds.filter((u) => u !== id))}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <select
          value=""
          aria-label={t('studio.web.editor.addPerson')}
          disabled={!directory}
          onChange={(e) => e.target.value && onUsers([...userIds, e.target.value])}
        >
          <option value="">{t('studio.web.editor.addPerson')}</option>
          {directory?.writers
            .filter((w) => !userIds.includes(w.userId))
            .map((w) => (
              <option key={w.userId} value={w.userId}>
                {w.name}
              </option>
            ))}
        </select>
      </div>

      <div className="field">
        <span>{t('studio.web.editor.groupsLabel')}</span>
        {orgIds.length > 0 ? (
          <ul className="chips">
            {orgIds.map((id) => (
              <li key={id}>
                {groupName(id)}
                <button
                  type="button"
                  aria-label={`${t('studio.web.editor.remove')} ${groupName(id)}`}
                  onClick={() => onOrgs(orgIds.filter((o) => o !== id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <select
          value=""
          aria-label={t('studio.web.editor.addGroup')}
          disabled={!directory || directory.groups.length === 0}
          onChange={(e) => e.target.value && onOrgs([...orgIds, e.target.value])}
        >
          <option value="">{t('studio.web.editor.addGroup')}</option>
          {directory?.groups
            .filter((g) => !orgIds.includes(g.id))
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </div>
    </>
  );
}
