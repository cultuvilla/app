import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  observability,
  resolveVersionGate,
  shouldPromptUpdate,
  watchAppVersionConfig,
  type AppVersionConfig,
  type UpdatePromptRecord,
} from '@cultuvilla/shared';
import { AppUpdateModal } from './AppUpdateModal';
import { getRunningVersion, getGatePlatform } from '../lib/appVersion';
import { useT } from '../lib/i18n';

const PROMPT_RECORD_KEY = 'cultuvilla:appUpdate:lastPrompt';

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
  const platform = getGatePlatform();
  // undefined until the first answer: no modal yet, and none flashes in.
  const [config, setConfig] = useState<AppVersionConfig | null | undefined>(undefined);
  const [nudgeVisible, setNudgeVisible] = useState(false);

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
        setConfig(null);
      },
    );
  }, [platform]);

  const decision =
    config === undefined ? 'loading' : resolveVersionGate(getRunningVersion(), config, platform);
  const storeUrl = config && platform !== 'web' ? config.storeUrl[platform] : null;
  const nudgeVersion =
    decision === 'nudge' && config && platform !== 'web' ? config[platform].latest : null;

  useEffect(() => {
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

  // Fail open: children always render. The hard blocker is a modal ON TOP of
  // them so a stale binary can't be used, but nothing is unmounted — a bad read
  // (null config, unparseable version) resolves to 'ok' and is invisible.
  return (
    <>
      {children}
      <AppUpdateModal
        visible={decision === 'block'}
        title={t('appUpdate.blockTitle')}
        body={t('appUpdate.blockBody')}
        ctaLabel={t('appUpdate.cta')}
        onUpdate={openStore}
      />
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
