// The only place a Firestore trigger is defined: `onDocument*` is restricted to
// this directory by functions/eslint.config.mjs.
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

export type DefineDocumentTriggerOptions<Kind extends DocumentTriggerKind, Document extends string> = DocumentOptions<Document> & {
  kind: Kind;
};

const DEFINERS = {
  created: onDocumentCreated,
  updated: onDocumentUpdated,
  deleted: onDocumentDeleted,
  written: onDocumentWritten,
} as const;

/** `name` is the export name in `index.ts`. */
export function defineDocumentTrigger<Kind extends DocumentTriggerKind, Document extends string>(
  name: string,
  { kind, ...options }: DefineDocumentTriggerOptions<Kind, Document>,
  handler: (event: DocumentTriggerEvent<Kind, Document>) => unknown,
): CloudFunction<DocumentTriggerEvent<Kind, Document>> {
  // One cast for four builders whose only difference is the event they hand over.
  const define = DEFINERS[kind] as unknown as (
    opts: DocumentOptions<Document>,
    fn: (event: DocumentTriggerEvent<Kind, Document>) => unknown,
  ) => CloudFunction<DocumentTriggerEvent<Kind, Document>>;
  return register(name, 'documentTrigger', define({ region: DEFAULT_FUNCTIONS_REGION, ...options }, handler));
}
