import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { observability, OBSERVABILITY_EVENTS } from '@cultuvilla/shared';
import { parseLink } from '@cultuvilla/shared/services/deepLinkService';

/**
 * A link's path IS the app route — `/matabuena/evento/fiestas_e1` is both the
 * URL and the expo-router path — so routing a deep link is just replaying the
 * path we parsed. `parseLink` still gates it: an unknown host or an unknown
 * shape must fall through to the browser rather than open an app screen. An org
 * invite needs nothing extra: its `/unirse` route adds the join intent itself.
 */
function route(url: string, surface: 'cold_start' | 'running'): void {
  const parsed = parseLink(url);
  if (!parsed) return;
  // The app-side half of the web sign-up question
  // (docs/decisions/web-is-a-read-site.md): how often a shared link lands in
  // an installed app rather than the browser, and on what.
  observability.trackEvent(OBSERVABILITY_EVENTS.APP_LINK_OPENED, {
    entityKind: parsed.resource,
    viaInvite: parsed.kind === 'invite',
    surface,
  });
  router.replace(parsed.path as never);
}

export function useDeepLinkRouter(): void {
  useEffect(() => {
    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      if (!cancelled && url) route(url, 'cold_start');
    });
    const sub = Linking.addEventListener('url', ({ url }) => route(url, 'running'));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
}
