import { useEffect } from 'react';
import { useStudioAuth } from './auth/StudioAuth';
import { t } from './i18n';
import { navigate, useRoute } from './router';
import { ArticleEditorScreen } from './screens/ArticleEditorScreen';
import { ArticleListScreen } from './screens/ArticleListScreen';
import { PhoneHandoffScreen } from './screens/PhoneHandoffScreen';
import { SignInScreen } from './screens/SignInScreen';

export function App() {
  const route = useRoute();
  const { user, ready, signOut } = useStudioAuth();

  useEffect(() => {
    if (!route) navigate({ name: 'articles' }, { replace: true });
  }, [route]);

  if (!route) return null;
  if (route.name === 'pairing') return <PhoneHandoffScreen pairingId={route.pairingId} />;
  if (!ready) return <main className="page muted">{t('common.loading')}</main>;
  if (!user) return <SignInScreen />;

  return (
    <>
      <header className="studio-header">
        <a
          className="studio-brand"
          href="/estudio"
          onClick={(e) => {
            e.preventDefault();
            navigate({ name: 'articles' });
          }}
        >
          <img src="/brand/logo-96.png" alt="" width={28} height={28} />
          <span>{t('studio.web.name')}</span>
        </a>
        <button type="button" className="button ghost" onClick={() => void signOut()}>
          {t('studio.web.signOut')}
        </button>
      </header>
      {route.name === 'articles' ? (
        <ArticleListScreen />
      ) : (
        <ArticleEditorScreen id={route.name === 'article' ? route.id : null} />
      )}
    </>
  );
}
