import { compareVersions } from './semver';
import type { AppVersionConfig } from '../models/config';

export type GateDecision = 'block' | 'nudge' | 'ok';

/**
 * Decide whether a running client must update. Fails open ('ok') on web, a
 * missing config, or any unparseable version — the gate must never brick the
 * app over a bad read.
 */
export function resolveVersionGate(
  running: string,
  config: AppVersionConfig | null,
  platform: 'ios' | 'android' | 'web',
): GateDecision {
  if (platform === 'web' || !config) return 'ok';
  const { minSupported, latest } = config[platform];
  try {
    if (compareVersions(running, minSupported) < 0) return 'block';
    if (compareVersions(running, latest) < 0) return 'nudge';
    return 'ok';
  } catch {
    return 'ok';
  }
}

/**
 * The last wall the server published for this platform, kept on the device so
 * a walled binary blocks at cold start before the config answers — offline,
 * after sign-out wiped the Firestore cache, or on a missing config doc. The
 * store URL rides along so the blocker's button still works.
 */
export interface RememberedWall {
  minSupported: string;
  storeUrl: string;
}

/** What to remember from a config answer, or null where there is no wall to keep. */
export function wallToRemember(
  config: AppVersionConfig,
  platform: 'ios' | 'android' | 'web',
): RememberedWall | null {
  if (platform === 'web') return null;
  return { minSupported: config[platform].minSupported, storeUrl: config.storeUrl[platform] };
}

/**
 * Does the remembered wall block the running version? Used only until a config
 * answers: a fresh answer always wins, so a lowered wall comes down at once.
 * Fails open on a missing or unparseable record.
 */
export function isBehindRememberedWall(running: string, wall: RememberedWall | null): boolean {
  if (!wall) return false;
  try {
    return compareVersions(running, wall.minSupported) < 0;
  } catch {
    return false;
  }
}

/** Persisted record of the last time the soft "update available" prompt was shown. */
export interface UpdatePromptRecord {
  /** The `latest` version the prompt advertised. */
  version: string;
  /** Epoch millis at which it was shown. */
  promptedAt: number;
}

/** Days to wait before re-nagging about the SAME version. */
export const UPDATE_PROMPT_COOLDOWN_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Should the soft update prompt be shown now?
 *
 * The hard block ignores this entirely — it must appear on every launch. The
 * soft prompt is a modal, so showing it on every cold start would be nagware:
 * we remember the version we advertised and stay quiet for a cooldown. A NEW
 * `latest` resets the cooldown, so a genuinely new release is announced at once.
 */
export function shouldPromptUpdate(
  record: UpdatePromptRecord | null,
  latest: string,
  now: number,
  cooldownDays: number = UPDATE_PROMPT_COOLDOWN_DAYS,
): boolean {
  if (!record) return true;
  if (record.version !== latest) return true;
  return now - record.promptedAt >= cooldownDays * DAY_MS;
}
