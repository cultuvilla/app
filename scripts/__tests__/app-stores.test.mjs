import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_STORES_PATH, currentStoreUrl, storeFieldFrom, storeUrlFrom } from '../lib/app-stores.mjs';

const src = [
  'export const APP_STORES: { ios: string; android: string } = {',
  "  ios: 'https://apps.apple.com/es/app/cultuvilla/id6804756586',",
  "  android: '', // https://play.google.com/store/apps/details?id=com.cultuvilla.app",
  '};',
  '',
  'export const OTHER: { ios: string; android: string } = {',
  "  ios: 'not-a-url',",
  "  android: 'not-a-url',",
  '};',
].join('\n');

describe('storeUrlFrom', () => {
  it('reads a filled-in URL', () => {
    assert.equal(storeUrlFrom(src, 'ios'), 'https://apps.apple.com/es/app/cultuvilla/id6804756586');
  });

  it('reads an empty one as empty, ignoring the trailing comment', () => {
    assert.equal(storeUrlFrom(src, 'android'), '');
  });

  // `: { ios: string; android: string }` sits between the name and the literal,
  // so a matcher scanning from the name forward could read `string` as the URL.
  it('does not match the key inside the type annotation', () => {
    assert.notEqual(storeUrlFrom(src, 'ios'), 'string');
  });

  // Another object keyed by ios/android must never be read in APP_STORES' place.
  it('does not leak between objects', () => {
    assert.equal(storeFieldFrom(src, 'OTHER', 'ios'), 'not-a-url');
    assert.equal(storeUrlFrom(src, 'ios'), 'https://apps.apple.com/es/app/cultuvilla/id6804756586');
  });

  it('throws when the object or key is gone, rather than reporting "no listing"', () => {
    assert.throws(() => storeUrlFrom('const x: { ios: string } = {};', 'ios'), /APP_STORES not found/);
    assert.throws(() => storeUrlFrom(src, 'windows'), /APP_STORES.windows/);
  });
});

describe('the real appStores.ts', () => {
  const source = readFileSync(APP_STORES_PATH, 'utf8');

  // Guards against a matcher that returns '' for everything — indistinguishable
  // from "no listing yet" unless checked against what the file actually says.
  it('is read as it is written', () => {
    for (const key of ['ios', 'android']) {
      assert.ok(source.includes(`${key}: '${currentStoreUrl(key)}'`), `${key} URL misread`);
    }
  });

  // The served version moved to config/appVersion, written by the announce
  // poller. A hand-edited copy here is the stale second source it replaced.
  it('declares no store version', () => {
    assert.doesNotMatch(source, /APP_STORE_VERSIONS/);
  });
});
