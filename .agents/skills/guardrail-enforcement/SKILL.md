---
name: guardrail-enforcement
description: Procedure for choosing where a business-rule guardrail (identity/membership, state transition, eligibility, capacity, role check) lives in cultuvilla. Use when adding or modifying any check that gates a write — in `packages/shared/src/services/`, `firestore.rules`, or `functions/src/`. Picks the right layer for the threat model and codifies the admin-callable pattern for predicates Firestore rules can't express.
---

# Guardrail enforcement layers

Every business-rule guardrail must be enforced beyond the UI. The UI may (and usually should) replicate the check for UX, but it must never be the only line of defense. The right home depends on the threat — who can bypass each layer.

## Three layers

1. **UI (UX layer)** — disabled buttons, hidden controls, friendly errors. Cosmetic; trivially bypassed.
2. **Shared service (`packages/shared/src/services/*.ts`) — consistency layer.** Catches drift between clients (web vs. future mobile, old vs. new builds), surfaces consistent errors, and protects future UI refactors from accidentally dropping a gate. **This code runs in the browser** — it does NOT defend against a hostile actor calling Firestore or callables directly. Treat it as a consistency boundary, not a trust boundary.
3. **Server (Firestore rules + admin-backed Cloud Functions) — trust boundary.** The only layer a hostile client cannot bypass.

## Decision tree — which layer for which guardrail

| Guardrail type | Home |
|---|---|
| Trust-sensitive state (role grants, organization approval, occupation proposal approval) | **Cloud Function callable (admin SDK)** |
| Cross-user writes (writing to another user's doc or persona) | **Cloud Function callable** |
| Identity/membership requiring cross-doc reads (e.g. "uid is admin of village X and X owns event Y") | **Cloud Function callable** |
| Atomic multi-doc updates spanning security boundaries | **Cloud Function callable** |
| Doc ownership ("only the creator can update") | **Firestore rule** |
| Field-shape invariants on a single doc (required fields, allowed status transitions, denormalized fields locked) | **Firestore rule** |
| Status guards / eligibility for an action already protected by one of the above (capacity, deadline, role) | **Shared service** (consistency + UX errors) |
| Pure UX gates (hide a button, friendly text) | **UI only** |

If a check could fit two layers, prefer the higher one — rules over service, callable over rules — for any rule whose violation would let a malicious caller affect another user's data, scoring, role, or trust state.

## Admin-callable recipe (strengthening the trust layer)

When the predicate doesn't fit in a Firestore rule (cross-doc read, multi-step transaction, cross-user write), the pattern is:

**1. Lock down direct client writes** in `firestore.rules`. Either deny entirely:

```
allow update: if false;
```

…or restrict the diff to known-safe fields:

```
allow update: if isAuthenticated() &&
  request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['safeField']);
```

**2. Add the callable** in `functions/src/<name>.ts`:

```ts
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { db } from './firebaseAdmin';

export const doSensitiveThing = onCall(async (request) => {
  // Auth — never trust a uid from `request.data`; derive from the platform.
  const authenticatedUid = request.auth?.uid;
  if (!authenticatedUid) {
    throw new HttpsError('unauthenticated', 'User not authenticated');
  }

  const { villageId, eventId } = request.data ?? {};
  if (!villageId || !eventId) {
    throw new HttpsError('invalid-argument', 'villageId and eventId are required');
  }

  await db.runTransaction(async (tx) => {
    const eventRef = db.doc(`villages/${villageId}/events/${eventId}`);
    const snap = await tx.get(eventRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }
    const event = snap.data()!;

    // Derive identity from the doc — DON'T trust client claims of who they are.
    if (event.createdBy !== authenticatedUid) {
      throw new HttpsError('permission-denied', 'You are not the organizer of this event');
    }

    // State-machine + eligibility predicates.
    if (event.status !== 'open') {
      throw new HttpsError('failed-precondition', 'Event is not open');
    }

    // Admin write bypasses rules.
    tx.update(eventRef, { /* … */ });
  });

  logger.info('Sensitive thing applied', {
    handler: 'doSensitiveThing',
    villageId,
    eventId,
    actorUid: authenticatedUid,
  });
});
```

Notes:
- **Always derive identity from `request.auth.uid`.** Never trust a uid passed in `request.data`.
- **Use `runTransaction`** when the predicate depends on a read of the same doc you're writing.
- **Log with `handler` set to the callable name** (see the `cloud-function-logging` skill).
- **Don't catch and swallow** the `HttpsError` — let it propagate to the client so the service layer can render a friendly error.

**3. Update the shared service** to call the function instead of writing Firestore directly:

```ts
import { getFunctions, httpsCallable } from 'firebase/functions';

export async function doSensitiveThing(villageId: string, eventId: string): Promise<void> {
  const fn = httpsCallable(getFunctions(), 'doSensitiveThing');
  await fn({ villageId, eventId });
}
```

Keep the same export signature so callers don't change.

**4. Mirror the predicate in the shared service** as a layer-2 consistency check — fail fast with a friendly error before hitting the network. The callable remains the source of truth.

```ts
if (event.status !== 'open') {
  throw new Error('Event is not open');
}
```

## Existing patterns in cultuvilla

- **[`functions/src/organizations/changeOrgMemberRole.ts`](../../../functions/src/organizations/changeOrgMemberRole.ts)** — derives the caller from `request.auth`, checks org/app-admin authority, and writes the role change plus its audit record in one transaction.
- **[`functions/src/onOccupationProposalApproved.ts`](../../../functions/src/onOccupationProposalApproved.ts)** — trigger that fan-outs an approved occupation onto persons; admin-only collection.
- **[`functions/src/syncVillageDenormalization.ts`](../../../functions/src/syncVillageDenormalization.ts)** — trigger; not a callable but enforces that denormalized fields are written only by the trigger (rules forbid client writes).

When tightening a write, locate the rules block for the collection and either lock it or narrow the safe diff. Then point the shared service at the callable.

## Don't

- **Don't trust client-supplied identity params.** If a callable receives a `targetUserId` / `responderId` / `organizerUserId`, derive them from `request.auth.uid` and the doc — comparing the param to itself is not enforcement.
- **Don't call shared-service-only enforcement "server-side".** `packages/shared/src/services/*.ts` runs in the user's browser. Treating it as the trust boundary gives a false sense of security.
- **Don't add a Cloud Function for convenience** when Firestore rules already enforce the predicate. Cold starts, cost, harder tests — only reach for a callable when rules cannot express the rule.
- **Don't drop the UI gate** when adding a server check. UX still matters; the UI keeps the friendly path.

## When this skill applies

- Adding/modifying a function that mutates Firestore in any service file.
- Editing `firestore.rules` to allow/deny a new write pattern.
- Adding/modifying a callable or trigger under `functions/src/`.
- Auditing an existing flow for trust gaps where the UI gate may be the only defense.

## Companion skills

- `guardrail-audit` — to sweep a feature area or PR for missing guardrails.
- `touch-service` — to update the shared-service layer-2 mirror.
- `firestore-deploy` — to push the rules and functions.
- `cloud-function-logging` — for the structured-log convention inside the callable.
