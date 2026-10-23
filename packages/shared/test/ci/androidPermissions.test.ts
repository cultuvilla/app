import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Play rejects a production release whose manifest declares a permission the
// Play Console declarations deny. 1.7.1's upload failed on AD_ID, pulled in by
// native Firebase Analytics, because the app declares it uses no advertising ID.

const repoRoot = resolve(__dirname, '../../../..');
const appConfig = readFileSync(resolve(repoRoot, 'apps/mobile/app.config.ts'), 'utf8');
const blocked = appConfig.match(/blockedPermissions:\s*\[([\s\S]*?)\]/)?.[1] ?? '';

describe('Android blocked permissions', () => {
  it('strips the advertising ID the Play declaration says the app does not use', () => {
    expect(blocked).toContain("'com.google.android.gms.permission.AD_ID'");
  });

  // Saving a fiestas card needs no read access; Play's Photo and Video
  // Permissions policy rejects an app that declares it without a core need.
  it.each([
    'READ_MEDIA_IMAGES',
    'READ_MEDIA_VIDEO',
    'READ_MEDIA_AUDIO',
    'READ_MEDIA_VISUAL_USER_SELECTED',
  ])('strips %s, which expo-media-library pulls in', (permission) => {
    expect(blocked).toContain(`'android.permission.${permission}'`);
  });

  // saveToLibraryAsync refuses below Android 13 without it, so blocking it
  // would turn the download button into an error on Android 12 and older.
  it('keeps WRITE_EXTERNAL_STORAGE, which saving a card needs before Android 13', () => {
    expect(blocked).not.toContain("'android.permission.WRITE_EXTERNAL_STORAGE'");
  });
});
