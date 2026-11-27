/**
 * The account-deletion registry (`functions/src/account/cascade/registry.ts`)
 * and the collection table it names, loaded into a Node script — so an operator
 * script reads the SAME list the `deleteAccount` callable runs, never a copy.
 *
 * The registry is TypeScript inside the functions workspace, so it is bundled
 * with the deploy's own esbuild options (as `pnpm wrapped:preview` does). The
 * bundle lives under functions/node_modules/.cache: its externals
 * (firebase-admin, firebase-functions) resolve by walking up from it, and it is
 * never committed. `@cultuvilla/shared` resolves to its dist, so run
 * `pnpm shared:build` first.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FUNCTIONS_DIR = fileURLToPath(new URL('../../functions/', import.meta.url));
const BUNDLE = path.join(FUNCTIONS_DIR, 'node_modules', '.cache', 'uid-cascade.cjs');

const ENTRY = `
export { UID_CASCADE, UID_FREE } from './src/account/cascade/registry';
export { COLLECTIONS } from '@cultuvilla/shared/firebase/refs/admin';
`;

/** @returns {Promise<{ UID_CASCADE: object[], UID_FREE: Record<string, string>, COLLECTIONS: Record<string, { path: string, schema: unknown }> }>} */
export async function loadUidCascade() {
  const require = createRequire(path.join(FUNCTIONS_DIR, 'package.json'));
  const { build } = require('esbuild');
  const { sharedBuildOptions } = await import(path.join(FUNCTIONS_DIR, 'esbuild.shared.mjs'));
  await build({
    ...sharedBuildOptions,
    sourcemap: false,
    stdin: { contents: ENTRY, resolveDir: FUNCTIONS_DIR, loader: 'ts', sourcefile: 'uid-cascade.entry.ts' },
    outfile: BUNDLE,
    logLevel: 'warning',
  });
  return createRequire(import.meta.url)(BUNDLE);
}
