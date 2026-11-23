import { useEffect, useState } from 'react';
import type { NewsPostData } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { watchNewsPostsByOrganizer } from '@cultuvilla/shared/services/newsService';
import { formatDate } from '@cultuvilla/shared/utils/format';
import { useSignedInUser } from '../auth/StudioAuth';
import { villageName } from '../data/villages';
import { t } from '../i18n';
import { navigate } from '../router';
import { studioPath } from '../routes';

type Post = NewsPostData & { id: string };

function useVillageNames(ids: string[]): Map<string, string> {
  const [names, setNames] = useState(new Map<string, string>());
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    let cancelled = false;
    const unique = key ? key.split(',') : [];
    void Promise.all(unique.map(async (id) => [id, await villageName(id).catch(() => '')] as const)).then(
      (entries) => {
        if (!cancelled) setNames(new Map(entries));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}

/** The articles the user is a writer of, newest first. */
export function ArticleListScreen() {
  const user = useSignedInUser();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [failed, setFailed] = useState(false);
  const names = useVillageNames((posts ?? []).map((p) => p.municipalityId));

  useEffect(
    () =>
      watchNewsPostsByOrganizer(
        user.uid,
        { activeOnly: false },
        (next) => {
          setPosts(next);
          setFailed(false);
        },
        () => setFailed(true),
      ),
    [user.uid],
  );

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t('studio.web.articles.title')}</h1>
        <a
          className="button primary"
          href={studioPath({ name: 'newArticle' })}
          onClick={(e) => {
            e.preventDefault();
            navigate({ name: 'newArticle' });
          }}
        >
          {t('studio.web.articles.new')}
        </a>
      </div>
      {failed ? <p className="notice error">{t('studio.web.articles.loadError')}</p> : null}
      {posts === null && !failed ? <p className="muted">{t('common.loading')}</p> : null}
      {posts?.length === 0 ? <p className="notice">{t('studio.web.articles.empty')}</p> : null}
      {posts && posts.length > 0 ? (
        <ul className="article-list">
          {posts.map((post) => (
            <li key={post.id}>
              <a
                href={studioPath({ name: 'article', id: post.id })}
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ name: 'article', id: post.id });
                }}
              >
                <span className="article-title">{post.title}</span>
                <span className="article-meta">
                  {[
                    names.get(post.municipalityId),
                    t(`news.compose.category.${post.category}`),
                    t('studio.web.articles.updated', { date: formatDate(post.updatedAt) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {post.status !== 'active' ? <span className="badge">{t('studio.web.articles.hidden')}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
