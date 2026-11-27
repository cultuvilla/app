import type { Firestore } from 'firebase-admin/firestore';
import { UID_CASCADE } from './registry';
import type { CascadeCounts, CascadeEffect, CascadeEntry } from './types';

const isEffect = (entry: CascadeEntry): entry is CascadeEffect => entry.action === 'delete' || entry.action === 'anonymise';

/**
 * Run every effect in UID_CASCADE, in order, and return what each did keyed by
 * entry id (`comments.deleted`, `places.anonymised`, …). Stops at the first
 * failure: every effect is idempotent, so the caller retries the whole cascade.
 */
export async function runUidCascade(db: Firestore, uid: string): Promise<CascadeCounts> {
  const counts: Record<string, number> = {};
  for (const entry of UID_CASCADE.filter(isEffect)) {
    const done = await entry.run({ db, uid });
    for (const [name, value] of Object.entries(done)) counts[`${entry.id}.${name}`] = value;
  }
  return counts;
}
