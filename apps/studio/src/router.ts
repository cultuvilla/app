import { useSyncExternalStore } from 'react';
import { parseStudioPath, studioPath, type StudioRoute } from './routes';

const NAVIGATED = 'studio:navigate';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATED, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATED, onChange);
  };
}

/** The current route, or null for a path the studio does not have. */
export function useRoute(): StudioRoute | null {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return parseStudioPath(pathname);
}

export function navigate(route: StudioRoute, options: { replace?: boolean } = {}): void {
  const path = studioPath(route);
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATED));
}
