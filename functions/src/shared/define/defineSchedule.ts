// The only place a scheduled function is defined: `onSchedule` is restricted to
// this directory by functions/eslint.config.mjs.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { ScheduleFunction, ScheduleOptions, ScheduledEvent } from 'firebase-functions/v2/scheduler';

import { DEFAULT_FUNCTIONS_REGION } from './region';
import { register } from './registry';

/** `name` is the export name in `index.ts`. */
export function defineSchedule(
  name: string,
  options: ScheduleOptions,
  handler: (event: ScheduledEvent) => void | Promise<void>,
): ScheduleFunction {
  return register(name, 'schedule', onSchedule({ region: DEFAULT_FUNCTIONS_REGION, ...options }, handler));
}
