import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Expo Router's typed routes live in `.expo/types/router.d.ts` and `expo-env.d.ts`,
// both gitignored and written only when Expo runs. A fresh CI checkout had
// neither, so `tsc` saw `Href` as a plain string and passed: the org invite
// redirect's TS2322 failed every dev checkout that had run Metro and no PR.
// The mobile typecheck therefore generates them first, and every CI lane
// reaches it through `pnpm app:typecheck`.

const repoRoot = resolve(__dirname, '../../../..');
const scriptsOf = (pkg: string): Record<string, string> =>
  (JSON.parse(readFileSync(resolve(repoRoot, pkg), 'utf8')) as { scripts: Record<string, string> }).scripts;
const mobileScripts = scriptsOf('apps/mobile/package.json');
const rootScripts = scriptsOf('package.json');

describe('mobile typecheck sees typed routes', () => {
  it('generates the route types before tsc runs', () => {
    expect(mobileScripts.typegen).toBe('expo customize tsconfig.json');
    expect(mobileScripts.typecheck).toMatch(/^pnpm typegen && tsc --noEmit$/);
  });

  it('is the typecheck the root gate runs', () => {
    expect(rootScripts['app:typecheck']).toBe('pnpm --filter cultuvilla-mobile typecheck');
    expect(rootScripts.typecheck).toContain('pnpm app:typecheck');
  });
});
