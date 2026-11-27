/**
 * Where a function runs when its definition names no region — the platform's
 * own default, written down once. Firestore is in `europe-southwest1`
 * (docs/ops/cloud-run-baseline.md); moving handlers is the gateways' job, not
 * this constant's.
 */
export const DEFAULT_FUNCTIONS_REGION = 'us-central1';
