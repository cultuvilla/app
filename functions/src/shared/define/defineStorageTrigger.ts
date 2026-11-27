// The only place a Cloud Storage trigger is defined: `onObject*` is restricted
// to this directory by functions/eslint.config.mjs. No default region: a
// Storage trigger must name its bucket's (AGENTS.md, *Storage triggers*).
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import type { CloudFunction } from 'firebase-functions/v2';
import type { StorageEvent, StorageOptions } from 'firebase-functions/v2/storage';

import { register } from './registry';

/** `name` is the export name in `index.ts`. */
export function defineObjectFinalized(
  name: string,
  options: StorageOptions & { region: string },
  handler: (event: StorageEvent) => unknown,
): CloudFunction<StorageEvent> {
  return register(name, 'storageTrigger', onObjectFinalized(options, handler));
}
