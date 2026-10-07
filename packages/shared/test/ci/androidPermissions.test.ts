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
});
