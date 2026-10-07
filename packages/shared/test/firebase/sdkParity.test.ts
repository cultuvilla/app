// The app runs the `*.native.ts` side of the SDK seam (src/firebase/sdk), the
// tests the JS side. A value imported from the seam but missing on the native
// side compiles and passes every test here, then is `undefined` on a phone —
// so every imported value name must be exported by the native twin.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(__dirname, '../../../..');
const sdkDir = resolve(__dirname, '../../src/firebase/sdk');
const MODULES = ['firestore', 'auth', 'functions', 'storage'] as const;
const ROOTS = ['packages/shared/src', 'apps/mobile/app', 'apps/mobile/components', 'apps/mobile/lib'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === 'node_modules' || name === '__tests__') return [];
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function importedValues(module: string): Map<string, string> {
  const used = new Map<string, string>();
  const re = new RegExp(String.raw`import\s+\{([^}]*)\}\s+from\s+'[^']*sdk/${module}'`, 'g');
  for (const root of ROOTS) {
    for (const file of files(resolve(repo, root))) {
      if (file.startsWith(sdkDir)) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(re)) {
        for (const part of match[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0]?.trim();
          if (name && !name.startsWith('type ')) used.set(name, file.replace(`${repo}/`, ''));
        }
      }
    }
  }
  return used;
}

function nativeExports(module: string): Set<string> {
  const src = readFileSync(join(sdkDir, `${module}.native.ts`), 'utf8').replace(/\/\/.*$/gm, '');
  const names = new Set<string>();
  for (const block of src.matchAll(/export\s+\{([^}]*)\}/g)) {
    for (const part of block[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  for (const fn of src.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/g)) names.add(fn[1]);
  return names;
}

describe('SDK seam parity', () => {
  it.each(MODULES)('every value imported from sdk/%s exists in its .native twin', (module) => {
    const exported = nativeExports(module);
    for (const [name, file] of importedValues(module)) {
      expect(exported, `${file} imports ${name} from sdk/${module}`).toContain(name);
    }
  });
});
