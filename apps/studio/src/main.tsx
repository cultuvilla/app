import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StudioAuthProvider } from './auth/StudioAuth';
import { startFirebase } from './firebase';
import { t } from './i18n';
import { applyTheme } from './theme';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('studio: #root is missing');
applyTheme(document.documentElement);

startFirebase().then(
  () =>
    createRoot(root).render(
      <StrictMode>
        <StudioAuthProvider>
          <App />
        </StudioAuthProvider>
      </StrictMode>,
    ),
  () => {
    root.textContent = t('common.error.unknown');
  },
);
