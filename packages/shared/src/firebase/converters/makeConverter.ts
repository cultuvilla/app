import type { z } from 'zod';
import { normalize, denormalize, type SdkCtors } from './walkers';

/**
 * Build a Firestore converter (`{ toFirestore, fromFirestore }`) from a Zod
 * schema and an SDK adapter. Strict on both directions:
 *   - reads: snap.data() is normalized (Timestamp -> Date, GeoPoint -> {lat,lng})
 *     and then validated against the schema; throws on mismatch
 *   - writes: the model is validated against the schema first, then denormalized
 *     (Date -> Timestamp, {lat,lng} -> GeoPoint)
 *
 * The returned object is shaped to match Firestore's `FirestoreDataConverter`.
 * We don't import that type directly so the same converter works for both the
 * client SDK and the admin SDK (which expose structurally-identical interfaces).
 */
export function makeConverter<S extends z.ZodType>(schema: S, sdk: SdkCtors) {
  type Model = z.infer<S>;
  return {
    toFirestore(model: Model): Record<string, unknown> {
      const parsed = schema.parse(model);
      return denormalize(parsed, sdk) as Record<string, unknown>;
    },
    fromFirestore(snap: { data(options?: { serverTimestamps?: 'estimate' }): unknown }): Model {
      // A client snapshot of its own pending write — a cache-backed listener
      // sees one the moment a doc is saved — reads `serverTimestamp()` fields
      // as null by default, which the strict schema rejects. The local
      // estimate is what that field will hold. Admin snapshots ignore it.
      const normalized = normalize(snap.data({ serverTimestamps: 'estimate' }), sdk);
      return schema.parse(normalized);
    },
  };
}
