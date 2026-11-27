// The only place a Firestore trigger is defined: `onDocument*` is restricted to
// this directory by functions/eslint.config.mjs. The region and the retry
// policy are owned here once: a retried trigger is always bounded by event age,
// never left to the platform's seven days of redelivery.
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import type { CloudFunction, ParamsOf } from 'firebase-functions/v2';
import type {
  Change,
  DocumentOptions,
  DocumentSnapshot,
  FirestoreEvent,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';

import { DEFAULT_FUNCTIONS_REGION } from './region';
import { register } from './registry';

export type DocumentTriggerKind = 'created' | 'updated' | 'deleted' | 'written';

type EventDataOf<Kind extends DocumentTriggerKind> = Kind extends 'written'
  ? Change<DocumentSnapshot> | undefined
  : Kind extends 'updated'
    ? Change<QueryDocumentSnapshot> | undefined
    : QueryDocumentSnapshot | undefined;

export type DocumentTriggerEvent<Kind extends DocumentTriggerKind, Document extends string> = FirestoreEvent<
  EventDataOf<Kind>,
  ParamsOf<Document>
>;

/**
 * The event-age bounds a retried trigger picks from, by what its side effect is
 * worth late. A trigger never names a duration of its own
 * (`retryWindowSingleSource.test.ts`); add a class here when one is needed.
 */
export const TRIGGER_RETRY_WINDOW_MS = {
  /**
   * A side effect whose value decays — an alert, a push. A late run is stale at
   * best, and a failure that has not cleared in an hour is deterministic.
   */
  perishable: 60 * 60 * 1000,
} as const;

export interface TriggerRetry {
  /** An event older than this is logged as `abandonedMessage` and dropped instead of handled. */
  maxEventAgeMs: number;
  abandonedMessage: string;
}

export type DefineDocumentTriggerOptions<Kind extends DocumentTriggerKind, Document extends string> = Omit<
  DocumentOptions<Document>,
  'retry'
> & {
  kind: Kind;
  /**
   * Absent ⇒ a failed delivery is not retried. Present ⇒ retried within the
   * event-age bound. There is deliberately no unbounded form.
   */
  retry?: TriggerRetry;
};

const DEFINERS = {
  created: onDocumentCreated,
  updated: onDocumentUpdated,
  deleted: onDocumentDeleted,
  written: onDocumentWritten,
} as const;

/** How long ago the event happened, or `null` when it carries no parseable time. */
export const eventAgeMs = (event: { time?: string }, now: number = Date.now()): number | null => {
  const at = event.time ? Date.parse(event.time) : Number.NaN;
  return Number.isFinite(at) ? now - at : null;
};

/** `name` is the export name in `index.ts`. */
export function defineDocumentTrigger<Kind extends DocumentTriggerKind, Document extends string>(
  name: string,
  { kind, retry, ...options }: DefineDocumentTriggerOptions<Kind, Document>,
  handler: (event: DocumentTriggerEvent<Kind, Document>) => unknown,
): CloudFunction<DocumentTriggerEvent<Kind, Document>> {
  // One cast for four builders whose only difference is the event they hand over.
  const define = DEFINERS[kind] as unknown as (
    opts: DocumentOptions<Document>,
    fn: (event: DocumentTriggerEvent<Kind, Document>) => unknown,
  ) => CloudFunction<DocumentTriggerEvent<Kind, Document>>;

  const run = retry
    ? (event: DocumentTriggerEvent<Kind, Document>): unknown => {
        const age = eventAgeMs(event);
        if (age !== null && age > retry.maxEventAgeMs) {
          // The params are document ids, never personal data.
          logger.warn(retry.abandonedMessage, {
            handler: name,
            ...event.params,
            eventAgeMs: age,
            reason: 'past-retry-window',
          });
          return undefined;
        }
        return handler(event);
      }
    : handler;

  return register(
    name,
    'documentTrigger',
    define({ region: DEFAULT_FUNCTIONS_REGION, ...options, ...(retry ? { retry: true } : {}) }, run),
  );
}
