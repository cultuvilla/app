import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { resolveVillageRoute } from '@cultuvilla/shared/services/municipalityService';
import { ErrorState, Screen } from '../../components/primitives';
import { EntityDetailHeader } from '../../components/feature/EntityDetailHeader';
import { useT } from '../i18n';

export interface VillageRoute {
  municipalityId: string;
  /** The `/<pueblo>` segment — build child links from this, not from the id. */
  slug: string;
  /** The village's display name, for screens that title themselves after it. */
  name: string;
}

const VillageRouteContext = createContext<VillageRoute | null>(null);

type Resolution =
  | { status: 'loading' }
  | { status: 'ready'; municipalityId: string; name: string }
  | { status: 'missing' }
  | { status: 'error'; error: unknown };

/**
 * Screens under `app/[pueblo]/` are addressed by the village's slug, but read
 * their data by municipality id. The gate resolves one into the other (cached
 * for the session — slugs never move) and renders its children only once it
 * has, so a screen can read `useVillageRoute()` as a plain value instead of
 * threading a loading state through every effect.
 */
export function VillageRouteGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { pueblo } = useLocalSearchParams<{ pueblo: string }>();
  const slug = typeof pueblo === 'string' ? pueblo : '';
  const [resolution, setResolution] = useState<Resolution>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setResolution({ status: 'loading' });
    resolveVillageRoute(slug).then(
      (village) => {
        if (cancelled) return;
        setResolution(
          village
            ? { status: 'ready', municipalityId: village.id, name: village.name }
            : { status: 'missing' },
        );
      },
      (error: unknown) => {
        if (!cancelled) setResolution({ status: 'error', error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  if (resolution.status === 'ready') {
    return (
      <VillageRouteContext.Provider
        value={{ municipalityId: resolution.municipalityId, slug, name: resolution.name }}
      >
        {children}
      </VillageRouteContext.Provider>
    );
  }

  // The gate is often the first screen of a cold-start link, so there may be no
  // history: the header's back falls back to the home tab, so an unknown pueblo
  // is never a dead end on iOS (no hardware back).
  return (
    <Screen padded={false} topInset={false}>
      <EntityDetailHeader />
      {resolution.status === 'loading' ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : resolution.status === 'missing' ? (
        <ErrorState message={t('village.notFound')} />
      ) : (
        <ErrorState error={resolution.error} onRetry={() => setAttempt((n) => n + 1)} />
      )}
    </Screen>
  );
}

/** The village of the current `app/[pueblo]/` route. Only valid under a `VillageRouteGate`. */
export function useVillageRoute(): VillageRoute {
  const route = useContext(VillageRouteContext);
  if (!route) throw new Error('useVillageRoute must be used under a VillageRouteGate');
  return route;
}

/** Wraps a village screen so its body can call `useVillageRoute()`. */
export function withVillageRoute<P extends object>(Screen: (props: P) => ReactNode) {
  return function VillageRouteScreen(props: P) {
    return (
      <VillageRouteGate>
        <Screen {...props} />
      </VillageRouteGate>
    );
  };
}
