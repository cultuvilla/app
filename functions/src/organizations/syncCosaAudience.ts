import type { Firestore } from 'firebase-admin/firestore';
import { cosasCollection } from '@cultuvilla/shared/firebase/refs/admin';
import {
  CosatecaSettingsSchema,
  DEFAULT_COSATECA_SETTINGS,
  effectiveCosaAudience,
  type CosatecaAudience,
} from '@cultuvilla/shared/models';

/** A group's effective cosa audience from its raw org doc; a doc without the field is integrantes-only. */
export function orgCosaAudience(org: Record<string, unknown> | undefined): CosatecaAudience {
  const parsed = CosatecaSettingsSchema.safeParse(org?.['cosateca']);
  return effectiveCosaAudience(parsed.success ? parsed.data : DEFAULT_COSATECA_SETTINGS);
}

/**
 * Keeps `cosas.audience` on the group's effective audience: run from
 * `onOrganizationUpdated` when the cosateca setting moves. The rules read it,
 * so closing a cosateca to the pueblo (or switching it off) hides its cosas
 * from the rest of the village at once. Returns how many cosas it rewrote.
 */
export async function syncCosaAudience(
  firestore: Firestore,
  orgId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Promise<number> {
  if (!after) return 0;
  const audience = orgCosaAudience(after);
  if (before && orgCosaAudience(before) === audience) return 0;
  const all = await cosasCollection(firestore).where('orgId', '==', orgId).get();
  const stale = all.docs.filter((d) => d.data().audience !== audience);
  for (let i = 0; i < stale.length; i += 400) {
    const batch = firestore.batch();
    for (const d of stale.slice(i, i + 400)) batch.update(d.ref.withConverter(null), { audience });
    await batch.commit();
  }
  return stale.length;
}
