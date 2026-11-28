import { describe, it, expect } from 'vitest';
import {
  isBehindRememberedWall,
  resolveVersionGate,
  shouldPromptUpdate,
  wallToRemember,
} from '../../src/utils/versionGate';
import type { AppVersionConfig } from '../../src/models/config';

const config: AppVersionConfig = {
  ios: { minSupported: '1.2.0', latest: '1.5.0' },
  android: { minSupported: '1.1.0', latest: '1.5.0' },
  storeUrl: { ios: 'x', android: 'y' },
};

describe('resolveVersionGate', () => {
  it('blocks below minSupported', () => {
    expect(resolveVersionGate('1.1.0', config, 'ios')).toBe('block');
  });
  it('nudges between minSupported and latest', () => {
    expect(resolveVersionGate('1.3.0', config, 'ios')).toBe('nudge');
  });
  it('is ok at or above latest', () => {
    expect(resolveVersionGate('1.5.0', config, 'ios')).toBe('ok');
    expect(resolveVersionGate('2.0.0', config, 'ios')).toBe('ok');
  });
  it('uses the per-platform floor', () => {
    expect(resolveVersionGate('1.1.0', config, 'android')).toBe('nudge');
  });
  it('fails open on web', () => {
    expect(resolveVersionGate('0.0.1', config, 'web')).toBe('ok');
  });
  it('fails open on null config or malformed version', () => {
    expect(resolveVersionGate('1.0.0', null, 'ios')).toBe('ok');
    expect(resolveVersionGate('garbage', config, 'ios')).toBe('ok');
  });
});

describe('shouldPromptUpdate', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_700_000_000_000;

  it('prompts when nothing was ever recorded', () => {
    expect(shouldPromptUpdate(null, '1.5.0', now)).toBe(true);
  });

  it('stays quiet inside the cooldown for the same version', () => {
    const record = { version: '1.5.0', promptedAt: now - DAY };
    expect(shouldPromptUpdate(record, '1.5.0', now)).toBe(false);
  });

  it('prompts again once the cooldown has elapsed', () => {
    const record = { version: '1.5.0', promptedAt: now - 3 * DAY };
    expect(shouldPromptUpdate(record, '1.5.0', now)).toBe(true);
  });

  it('prompts immediately for a newer latest, cooldown or not', () => {
    const record = { version: '1.5.0', promptedAt: now };
    expect(shouldPromptUpdate(record, '1.6.0', now)).toBe(true);
  });

  it('honours a custom cooldown', () => {
    const record = { version: '1.5.0', promptedAt: now - 2 * DAY };
    expect(shouldPromptUpdate(record, '1.5.0', now, 7)).toBe(false);
    expect(shouldPromptUpdate(record, '1.5.0', now, 1)).toBe(true);
  });
});

describe('remembered wall', () => {
  it('remembers the platform wall and its store url', () => {
    expect(wallToRemember(config, 'ios')).toEqual({ minSupported: '1.2.0', storeUrl: 'x' });
    expect(wallToRemember(config, 'android')).toEqual({ minSupported: '1.1.0', storeUrl: 'y' });
    expect(wallToRemember(config, 'web')).toBeNull();
  });

  it('blocks only a version below the remembered wall', () => {
    const wall = { minSupported: '1.2.0', storeUrl: 'x' };
    expect(isBehindRememberedWall('1.1.9', wall)).toBe(true);
    expect(isBehindRememberedWall('1.2.0', wall)).toBe(false);
    expect(isBehindRememberedWall('2.0.0', wall)).toBe(false);
  });

  it('fails open on no record or an unparseable one', () => {
    expect(isBehindRememberedWall('1.0.0', null)).toBe(false);
    expect(isBehindRememberedWall('1.0.0', { minSupported: 'garbage', storeUrl: 'x' })).toBe(false);
  });
});
