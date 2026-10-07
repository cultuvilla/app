/**
 * Reads the store URLs out of `packages/shared/src/config/appStores.ts` — the
 * single source of truth for where the native apps live — so a Node script can
 * check them without a TypeScript toolchain.
 *
 * What version each store serves is not in that file: it lives in
 * `config/appVersion`, written by the announce poller once a store says so.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const APP_STORES_PATH = path.join(REPO_ROOT, 'packages/shared/src/config/appStores.ts');

/**
 * The body of one `export const <name> = { ... };` literal.
 *
 * Bound to the named object, so another `{ ios, android }` object added to the
 * file can never be read in its place; throws when the name is absent rather
 * than returning something that reads like an answer.
 *
 * `[^=]*` skips the type annotation (`: { ios: string; android: string }`),
 * which contains no `=`.
 */
export function objectLiteralBody(source, name) {
  const match = new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(source);
  if (!match) throw new Error(`${name} not found in appStores.ts — has it been renamed?`);
  return match[1];
}

/**
 * One platform's field from one object. Returns `''` for a declared-but-empty
 * value ("no listing yet"); throws when the key is missing entirely, because
 * those two are not the same fact and only one of them is expected.
 */
export function storeFieldFrom(source, name, key) {
  const match = new RegExp(`^\\s*${key}:\\s*'([^']*)'`, 'm').exec(objectLiteralBody(source, name));
  if (!match) throw new Error(`${name}.${key} not found in appStores.ts`);
  return match[1];
}

/** The store URL for `ios` | `android`, or `''` when it has no listing yet. */
export function storeUrlFrom(source, key) {
  return storeFieldFrom(source, 'APP_STORES', key);
}

export function currentStoreUrl(key) {
  return storeUrlFrom(readFileSync(APP_STORES_PATH, 'utf8'), key);
}
