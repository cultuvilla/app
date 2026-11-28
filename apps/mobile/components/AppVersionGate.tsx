import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isBehindRememberedWall,
  observability,
  resolveVersionGate,
  shouldPromptUpdate,
  wallToRemember,
  watchAppVersionConfig,
  type AppVersionConfig,
  type RememberedWall,
  type UpdatePromptRecord,
} from '@cultuvilla/shared';
import { AppUpdateModal } from './AppUpdateModal';
import { getRunningVersion, getGatePlatform } from '../lib/appVersion';
import { useT } from '../lib/i18n';
import { useMarkAppReady } from './intro/IntroHost';

const PROMPT_RECORD_KEY = 'cultuvilla:appUpdate:lastPrompt';
// Kept in AsyncStorage, not only in Firestore's cache, because sign-out wipes
// that cache (clearLocalCache) and a walled binary must still block offline.
const WALL_KEY = 'cultuvilla:appUpdate:wall';
// The remembered wall holds the app back until it is read; a storage that never
// answers must not hold it back for good.
const WALL_READ_TIMEOUT_MS = 1000;

function isRememberedWall(value: unknown): value is RememberedWall {
  if (typeof value !== 'object' || value === null) return false;
  const { minSupported, storeUrl } = value as Record<string, unknown>;
  return typeof minSupported === 'string' && typeof storeUrl === 'string';
}

async function readRememberedWall(): Promise<RememberedWall | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), WALL_READ_TIMEOUT_MS);
  });
  try {
    const raw = await Promise.race([AsyncStorage.getItem(WALL_KEY), timeout]);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRememberedWall(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readPromptRecord(): Promise<UpdatePromptRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(PROMPT_RECORD_KEY);
    return raw ? (JSON.parse(raw) as UpdatePromptRecord) : null;
  } catch {
    return null;
  }
}

async function writePromptRecord(record: UpdatePromptRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_RECORD_KEY, JSON.stringify(record));
  } catch {
    // A failed write only means we ask again next launch — never worth crashing.
  }
}

export function AppVersionGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const markAppReady = useMarkAppReady();
  const platform = getGatePlatform();
  // undefined until the first answer: no modal yet, and none flashes in.
  const [config, setConfig] = useState<AppVersionConfig | null | undefined>(undefined);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  // undefined until read. Stands in for the config until a non-null one arrives.
  const [remembered, setRemembered] = useState<RememberedWall | null | undefined>(
    platform === 'web' ? null : undefined,
  );

  useEffect(() => {
    if (platform === 'web') return;
    let active = true;
    void readRememberedWall().then((wall) => {
      if (active) setRemembered((prev) => (prev === undefined ? wall : prev));
    });
    return () => {
      active = false;
    };
  }, [platform]);

  // Every config answer replaces the memory, so a lowered wall is forgotten too.
  const wallFromConfig = config ? wallToRemember(config, platform) : null;
  const wallMinSupported = wallFromConfig?.minSupported;
  const wallStoreUrl = wallFromConfig?.storeUrl;
  useEffect(() => {
    if (wallMinSupported === undefined || wallStoreUrl === undefined) return;
    const wall = { minSupported: wallMinSupported, storeUrl: wallStoreUrl };
    setRemembered(wall);
    void AsyncStorage.setItem(WALL_KEY, JSON.stringify(wall)).catch(() => {
      // Only costs the offline block on the next cold start; never worth crashing.
    });
  }, [wallMinSupported, wallStoreUrl]);

  useEffect(() => {
    if (platform === 'web') return;
    // A listener rather than one read at launch, so a slow first connection or
    // a wall raised mid-session still lands (appConfigService).
    return watchAppVersionConfig(
      (next) => {
        if (next === null) {
          observability.captureError(new Error('config/appVersion is missing'), {
            operation: 'appVersionGate:missing',
          });
        }
        setConfig(next);
      },
      (error) => {
        // The gate fails open, so this report is the only sign it is down.
        observability.captureError(error, {
          operation: 'appVersionGate:watch',
        });
        // A listener error is terminal: keep the last answer, or a wall already
        // up would come down for the rest of the session. Fail open only when
        // nothing ever arrived.
        setConfig((prev) => (prev === undefined ? null : prev));
      },
    );
  }, [platform]);

  // Until a config answers — and when it answers with nothing (a missing doc, a
  // failed listener) — the remembered wall decides, so a walled binary never
  // runs while the network is slow or absent.
  const decision = config
    ? resolveVersionGate(getRunningVersion(), config, platform)
    : isBehindRememberedWall(getRunningVersion(), remembered ?? null)
      ? 'block'
      : config === undefined
        ? 'loading'
        : 'ok';
  const storeUrl =
    config && platform !== 'web' ? config.storeUrl[platform] : (remembered?.storeUrl ?? null);
  const nudgeVersion =
    decision === 'nudge' && config && platform !== 'web' ? config[platform].latest : null;

  useEffect(() => {
    // Every change re-earns visibility through the cooldown, so a nudge that
    // leaves and comes back mid-session can't reappear on a stale flag.
    setNudgeVisible(false);
    if (!nudgeVersion) return;
    let active = true;
    void (async () => {
      const record = await readPromptRecord();
      if (!active || !shouldPromptUpdate(record, nudgeVersion, Date.now())) return;
      setNudgeVisible(true);
      void writePromptRecord({ version: nudgeVersion, promptedAt: Date.now() });
    })();
    return () => {
      active = false;
    };
  }, [nudgeVersion]);

  const openStore = useCallback(() => {
    if (storeUrl) void Linking.openURL(storeUrl);
  }, [storeUrl]);

  const walled = decision === 'block';

  // The intro otherwise waits for the first route, which a walled app never
  // mounts — hand over to the blocker at once.
  useEffect(() => {
    if (walled) markAppReady();
  }, [walled, markAppReady]);

  // A hard wall replaces the app tree instead of covering it: with no router,
  // no providers and no listeners mounted, a deep link or a notification tap
  // has nothing to reach, so none of the walled version's code runs. A wall
  // raised mid-session unmounts the tree, whose cleanup detaches them.
  // docs/decisions/hard-wall-replaces-app-tree.md
  if (walled) {
    return (
      <View className="flex-1 bg-surface">
        <AppUpdateModal
          visible
          title={t('appUpdate.blockTitle')}
          body={t('appUpdate.blockBody')}
          ctaLabel={t('appUpdate.cta')}
          onUpdate={openStore}
        />
      </View>
    );
  }

  // The remembered wall is a local read of a few milliseconds; mounting the app
  // before it answers would let a walled binary run its first screen.
  if (remembered === undefined && config === undefined) return null;

  // Fail open: while the config loads, and on a bad read (null config,
  // unparseable version resolves to 'ok'), the app runs as usual. The soft
  // nudge sits on top of a working app.
  return (
    <>
      {children}
      <AppUpdateModal
        visible={decision === 'nudge' && nudgeVisible}
        title={t('appUpdate.nudgeTitle')}
        body={t('appUpdate.nudgeBody')}
        ctaLabel={t('appUpdate.cta')}
        onUpdate={() => {
          setNudgeVisible(false);
          openStore();
        }}
        onDismiss={() => setNudgeVisible(false)}
        dismissLabel={t('appUpdate.later')}
      />
    </>
  );
}
