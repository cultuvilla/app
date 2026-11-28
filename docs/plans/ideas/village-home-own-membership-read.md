# The village home reads the viewer's own member doc, not the whole roster

**Priority:** medium — the hottest screen reads every member doc of the village on each focus, for every viewer, guests included, to learn one bit

**Goal:** answer "is the viewer a member, and an admin?" on the village home with one read of the viewer's own member doc, so a focus stops costing a read per villager and one stale member doc can no longer drop a member to the guest view.

## Context

As of `8d7a317b` (origin/develop, 2026-11-28).

`useChrome` in `apps/mobile/lib/useVillageHome.ts` runs on mount, on every focus (`useFocusEffect`) and on `reload`. It does, in one `Promise.all`:
- `isVillageAdmin(municipalityId, uid)`: one read of `municipalities/{id}/members/{uid}`;
- `getVillageMembers(municipalityId)`: **every** doc of `municipalities/{id}/members`, then `members.some((m) => m.userId === uid)`.

Three problems:
1. **Reads.** A guest (`uid == null`) still runs `getVillageMembers`, though `isMember` is forced `false`. Matabuena had 178 members on 2026-09-29 (`docs/plans/ideas/village-first-steps.md`), so each focus of the pueblo tab (`app/(tabs)/mi-pueblo.tsx`) or of a shared `/[pueblo]` link (`app/[pueblo]/index.tsx`) costs ~179 reads to answer what one read answers.
2. **Fragility.** The roster goes through the strict converter (`municipalityMembersCollection` → `typedCollection` → `withConverter`). One member doc that predates a schema field throws, the `Promise.all` rejects, and the `catch` commits `{ ...NO_CHROME, membershipKnown: true }`: a member or village admin silently gets the guest view (no «Añadir contenido», no censo, no Wrapped prompt). `64ae52a6` (fix(village): ask for the people directory only as a member or app admin) took the people directory out of the chrome after visitors' refused reads (95 permission-denied reports in 30 days) — a different failure, same lesson: a read that can fail for reasons unrelated to the viewer should not sit in that `Promise.all`. The roster stayed in.
3. **Duplication.** The same member doc is read twice to answer two halves of one question. `getVillageMemberRole` in `packages/shared/src/services/villageMemberService.ts` exists for this ("Prefer this over calling isVillageMember + isVillageAdmin"), and `useEntityCapabilities` already uses it.

Member docs are world-readable (`firestore.rules`, `match /members/{userId}`: `allow read: if true`), so the guest's roster read succeeds and is paid for in full rather than refused. The viewer's own doc still goes through the same strict converter, so a stale *own* member doc keeps failing as today; only an unrelated member's stale doc stops mattering.

`apps/mobile/lib/__tests__/useVillageHome.test.ts` mocks `getVillageMembers` as the membership source in five cases (the default mock plus the non-member, censo and people-directory cases); its comment "the home never reads the roster" is about the `municipalityPeople` directory (`64ae52a6`), not the member roster.

What was checked and dropped from this unit: a pure "village home model" module for `VillageHomeBody.tsx`. Its rules (membership slot, `canManage`, wiki-phase prompt, peñas/agrupaciones split, censo row, Wrapped prompt, per-kind settlements) are a dozen booleans already pinned by `VillageHomeBody.test.tsx` (762 lines, including page order); its fixes (`63f55ac3`, `2a50f6f5`, `a2622655`) were visual or timing, not rule errors. And sharing section rules with the read site was already weighed and rejected in `docs/plans/ongoing/read-site-shared-list-rules.md` (Alternative B: the surfaces deliberately differ).

Dependency category: in-process (a service call the hook already mocks).

## Design

Shape A. In `useChrome`, replace `isVillageAdmin` + `getVillageMembers` with one `uid ? getVillageMemberRole(municipalityId, uid) : null`; `isMember = role !== null`, `villageAdmin = role === 'admin'`. Guests make no membership read. Nothing else in `Chrome` changes; `membershipKnown` keeps its meaning. `getVillageMembers` stays for its real list callers (`MembersList`, `OrganizerPicker`, studio `villageDirectory`).

**Alternatives considered:**
- Watch the viewer's member doc with `useWatch`: answers from cache at once and drops the focus reload for membership, but `offline-first-village.md` deliberately keeps the per-user chrome one-shot; a later change can revisit that.
- Keep the roster but move it out of the `Promise.all` (like `64ae52a6`): fixes the fragility, keeps the read fan-out.

**Testing strategy:** in `useVillageHome.test.ts`, mock `getVillageMemberRole` instead of `getVillageMembers`/`isVillageAdmin`; add: a guest makes no membership read; an `'admin'` role yields `villageAdmin` and `isMember`; a `null` role yields the non-member view and no censo read. The existing membership-dependent cases move to the new mock rather than being duplicated. `VillageHomeBody.test.tsx` is unaffected (it takes `VillageHomeState`).

## Paths

- `apps/mobile/lib/useVillageHome.ts` (`useChrome`)
- `apps/mobile/lib/__tests__/useVillageHome.test.ts`

## Approval

Pre-approved — "fixing a defect whose correct behaviour is not in dispute — a crash, a leak, a wrong result, code that breaks its own docs or tests". A member or village admin shown the guest view because an unrelated member doc fails to parse is a wrong result; the read fan-out half is a refactor that changes nothing observable ("debt and refactors"). Membership and admin answers are identical for every parseable roster: the member doc id is the uid (`members/{userId}`, created with `userId == userId`), which is what `getVillageMemberRole` reads. Per *What the words mean*, "the same result, faster or more reliably, does not count" as a user-visible change.

## Out of scope

- A pure section model for `VillageHomeBody` and a shared section list with the read site (see Context).
- Making the chrome live (watchers) — a decision `offline-first-village.md` owns.
- The organizer-request read in the same `Promise.all` (`getMyOrganizerRequests`, per user, small).
