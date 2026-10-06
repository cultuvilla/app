---
name: guardrail-audit
description: Procedure for auditing existing code (a service, feature area, or PR) in cultuvilla for missing business-rule guardrails. Use when a user asks to "audit X for guardrail coverage", "scan Y for missing checks", "check that Z has server-side validation", or when reviewing a PR that adds writes to a sensitive collection. Produces a findings table classifying each gate as GAP / RULE-BACKED / DEAD; gaps are fixed via the `guardrail-enforcement` skill.
---

# Guardrail audit

A guardrail is any check that gates a write — identity/membership, state transition, eligibility, capacity, role. The audit's job is to find places where a guardrail exists in the UI but is **not** re-validated where it must be: in the shared service (consistency), in Firestore rules, or in a Cloud Function callable (the trust boundary).

The companion skill `guardrail-enforcement` answers "where should a guardrail live?" — invoke it when fixing each finding. This skill answers "what's missing here?".

## When to invoke

- A user asks: "audit eventService", "scan event-creation for missing checks", "make sure org approval is enforced server-side."
- Reviewing a PR that adds writes to a sensitive collection (`villages/`, `events/`, `persons/`, `orgMembers/`, `organizations/`).
- Sweeping a feature area before shipping.

## Procedure

Three passes. Pass 1 collects candidates; Pass 2 verifies enforcement; Pass 3 triages and writes the findings table. Each pass is delegatable to a focused agent.

### Pass 1 — collect UI candidates

Grep across `apps/mobile/**` for patterns that typically indicate a UI-only gate:

- `disabled=` / `disabled:` on action buttons whose predicate is non-trivial.
- Variable/function names: `canEdit`, `canStart`, `canFinish`, `canApprove`, `canDelete`, `canInvite`, `canRegister`, `isOwner`, `isCreator`, `isAdmin`, `isOrganizer`, `isMember`.
- Status guards in handlers: `if (event.status !== 'open') return`, `if (registration.status === 'cancelled')`.
- Capacity / deadline guards: `event.capacity`, `event.deadline`, "already full" / "registration closed" comparisons before mutations.
- Early-returns of the form `toast(...); return;` / `setError(...); return;` immediately preceding a service call.

Each UI-only gate is a **candidate** — a rule the UI clearly cares about but that may or may not be enforced beyond the UI.

### Pass 2 — verify server/service enforcement

For each candidate from Pass 1, locate the service function it calls (under `packages/shared/src/services/`) and verify the same predicate runs there. Then check Firestore rules at [`firestore.rules`](../../../firestore.rules) and Cloud Function callables / triggers under `functions/src/`.

Three things to confirm:

1. **Cross-user writes** — the function takes a `userId` / `targetUid` / `personaId` parameter and writes to a doc keyed by it. Is the parameter constrained against `request.auth.uid` somewhere — by the rule, by a callable check, or by a server-side derivation?
2. **Trust-sensitive state** — role grants, organization approval, organizer-only event finalization, occupation proposal approval. Is the write behind a Cloud Function callable that runs under admin SDK?
3. **State transitions** — status flows, eligibility predicates, capacity. Are the predicates re-checked in the service function before the write, not just in the UI?

Also audit:

- All callables and triggers under `functions/src/` — each is an independent ingress and must enforce or delegate.
- Model-level invariants in `packages/shared/src/models/` that may already encode some checks (good — but they must be invoked from the service).
- **Read-only / subscription / cache-first functions are excluded by default.** Skip them unless a specific concern motivates including them.

### Pass 3 — triage and write the findings table

Classify each candidate into one of three buckets:

| Bucket | Definition | Typical action |
|---|---|---|
| **GAP** | The rule does not constrain enough; the function takes a target ID and the rule trusts it without checking against `request.auth.uid` or membership. Genuine security hole. | Fix per `guardrail-enforcement` skill — usually a callable + rule tightening. |
| **RULE-BACKED** | The rule rejects illegitimate writes; the function may produce cryptic errors but the security boundary holds. | Optional layer-2 mirror in the service for friendly errors. |
| **DEAD/SILENT-FAIL** | The function writes to a backend-only collection or otherwise can't succeed from a client. | Code-health cleanup, not security. Note and move on. |
| **TO VERIFY** | Need a rule cross-check before classifying. | Resolve before closing the audit. |

Output the findings as a table:

```markdown
| Rule | UI gate | Server / service enforcement | Status |
|---|---|---|---|
| Event creation requires village membership | `CreateEventForm.tsx:42` | `eventService.createEvent` — re-checks; rule also asserts | ✅ RULE-BACKED |
| Persona delete by creator only | `PersonaCard.tsx:88` | `personService.deletePerson` — trusts caller, rule allows any auth user | ❌ GAP |
```

Each row includes: the rule in plain language, where the UI enforces it, where the server *should* enforce it, and the bucket.

For GAP findings, also note severity (HIGH/MED/LOW):
- **HIGH** — cross-user data corruption, role escalation, financial implications.
- **MED** — same-user denial of service, stale-state writes.
- **LOW** — UX-only gaps where the rule blocks the write anyway.

## Common GAP patterns (red flags)

These shapes recur — flag them on sight:

- **Service function takes a `userId` / `personaId` / `targetUid` parameter and writes a doc keyed by it, with no `request.auth.uid`-derived check.** The parameter is trusted; a malicious client lies. → GAP, fix by deriving the value from `request.auth.uid` server-side.
- **Firestore update rule has an OR-branch that accepts "anyone" for non-load-bearing field changes** (e.g. allows updates as long as `createdAt` doesn't change). The OR branch dominates and lets generic mutations through. → GAP, tighten or replace the loose branch.
- **Rule allows admin OR an `isSafeUpdate` shape-only diff helper that doesn't check identity** of who's being added/removed/modified. → GAP — the helper must check actor identity.
- **Cloud Function callable trusts a uid from `request.data` instead of `request.auth.uid`.** → GAP, derive auth from the platform.
- **Denormalized field is writable from the client** (no diff lock in rules). → GAP, lock the field; trigger is the only writer.
- **A rule derives authority from a document field the same rule leaves writable.** Look at every `isVillageAdmin(resource.data.municipalityId)`, `isOwner(resource.data.createdBy)`, `resource.data.type == …`: if that field is not in the update's `affectedKeys().hasAny([...])` lock, the caller can rewrite the basis of their own permission check — moving a doc out of its moderators' reach, or into a privileged category. → GAP, add the field to the diff-lock. This is the highest-yield sweep in the whole audit and no UI comparison finds it, because no screen offers the write.
- **A field that a Cloud Function trigger reads as a pointer to another document** (`userId`, `ownerId`, `targetId`). The trigger runs under the Admin SDK and so bypasses rules entirely; if the client chose the pointer, the trigger is a write primitive against whatever it points at. → GAP, constrain the pointer to `request.auth.uid` at the rules layer.
- **Nested vs. top-level changes the answer.** For a doc at `parents/{pid}/children/{cid}`, a `pid` in the rule is a path variable and is immutable by construction. The same-named *field* on a top-level doc is not. Check which one you're looking at before reporting — siblings that look identical often differ here.

## Output checklist

Before closing the audit:

- [ ] Passes 1 and 2 covered every mutating export in scope (read-only / subscription / cache-first excluded by default).
- [ ] Findings table written, severity assigned to each GAP.
- [ ] Each GAP has a fix-layer recommendation per the `guardrail-enforcement` skill (callable / rule / service).
- [ ] Open questions — anything that needs threat-model input from the user — listed at the bottom.
- [ ] If the audit is a follow-up to a prior one, link the prior audit.

## Out of scope

- Performance optimisations of the new checks (most are O(1) lookups).
- Refactoring UI predicates into shared helpers (nice-to-have; not required for correctness).
- Content moderation, abuse policy, or rate limiting — different mitigation pattern; call out separately if surfaced during the audit.

## Companion skills

- `guardrail-enforcement` — to fix each finding.
- `touch-service` — when the fix lands in the service layer.
- `firestore-deploy` — when the fix updates rules.
