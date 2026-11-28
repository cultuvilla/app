# One catalog test that catches «1 personas» before QA does

**Priority:** high — the same defect has been fixed three times in three days (2ac91cfd, e9e7f697, b353cf3a), key by key, after the fact (the first after a QA pass), and one catalog straggler plus a handful of server-side strings still read «1 …» in the plural

**Landed:** none
**Gate:** none
**Next:** add the packages/i18n catalog test for counts outside an ICU plural, then fix the stragglers it finds

**Goal:** a `packages/i18n` test fails whenever a catalog message puts a count next to a plural word outside an ICU plural (or writes a plural the formatter cannot parse), so the next «1 personas» fails CI instead of reaching testers; and the stragglers it and the past fixes left behind read in the singular.

## Context

As of `294fd799` (origin/develop, 2026-11-21).

**The defect keeps coming back.** `packages/i18n/messages/es.json` is the hottest file the measure found (3031 lines, churn 147, 24 fix commits). Three of those fixes in three days are the same bug: a message interpolates a count with the noun fixed in the plural.
- 2ac91cfd `fix(village): agree group and barrio counts in number («1 persona»)` (2026-11-18): `village.hub.memberCount`, `village.admin.barrios.residentCount`.
- e9e7f697 `fix(copy): say grupo in group notifications and agree «1 …» counts in number` (PR #679, 2026-11-20): three `village.vocabulary.*` keys, plus hand-written copy in `functions/src/web/data.ts`, `pages.ts` and `packages/shared/src/models/notification/VillageEntityCopy.ts`.
- b353cf3a `fix(i18n): agree the remaining «1 …» counts in number` (2026-11-20): ten keys, from `groups.transparency.avisos.votes` to `village.wrapped.prompt.body`.

Each fix pins only its own keys in `apps/mobile/lib/__tests__/catalogCopy.test.ts` (`it.each` over key, vars, singular, plural). Nothing checks the catalog as a whole, so the next message written as `"{count} socios"` passes CI. `packages/i18n/test/` has catalog-wide invariants already (`keyParity.test.ts`: non-empty string leaves; `usedKeys.test.ts`: every key the app uses exists), but none about plurals.

**The mechanism.** 0f812f73 (2026-11-20) moved lookup and ICU plurals into `@cultuvilla/i18n` (`packages/i18n/index.ts`: `translate`, `format`, `applyPlurals`). The app's `createI18n` and the read site's `msg()` (`functions/src/web/copy.ts`) both go through it. `applyPlurals` supports exactly `{name, plural, one {…} other {…}}`, with no nested braces and no `=0` case. All 58 `plural,` occurrences in today's catalog match that form.
- The `i18n-add-string` skill's own example is `{count, plural, =0 {Sin asistentes} one {1 asistente} other {# asistentes}}`. `PLURAL_RE` does not match it, so a message written from the skill would render the raw ICU text. The skill also still describes `apps/web` (Next.js, `next-intl`), and that app no longer exists: `apps/` holds `mobile` and `studio`.

**A rule that would have caught all three.** I back-tested a two-part heuristic over the catalog. It looks only at what is left of a message once its parseable plurals are removed, and it skips `*.other` leaves whose sibling `*.one` exists (the key-pair plural that `VillageSections.tsx` picks by `count === 1`). It flags:
1. a placeholder followed, optionally after `de`, by a lowercase word ending in `s` (`{count} personas`, `de {count} pagadas`);
2. a placeholder after a plural determiner (`las|los|unos|unas {count}`).
- On `2ac91cfd^` it flags 17 messages: the 14 keys the three fixes touched that existed then, `event.spotsLeft` among them (e9e7f697 deleted it as unused), plus `village.vocabulary.seeAll` and the two `a las {time}` false positives below.
- On `b353cf3a^` it flags all 10 keys that fix changed (plus the same three as today).
- On today's catalog it flags 3 messages:
  - `village.vocabulary.seeAll` («Ver las {count}»), a **live defect**. `WordOfTheDayCard` renders it whenever a village has a word of the day, so a village with one word reads «Ver las 1».
  - `groups.tasks.dueAt` and `groups.cosateca.reserva.confirmBody` (`a las {time}`), both false positives: an hour, not a count.

Today's other count placeholders sit outside a plural correctly: a number next to a label (`Activos {count}`, `Reservas anuladas: {count}`), a multiplier (`Apuntados ×{count}`), an ordinal or index (`Tarea {n}`, `Opción {n}`, `{position}º`, `nº {number}`), a size with no counted noun (`grupos de {count}`), a range (`entre {min} y {max}`), or a word that does not inflect (`{count} sin votar`, `Avisos ({count} sin leer)`). None of these trips the rule, so the allowlist starts with only the two `a las {time}` keys.

**Stragglers outside the catalog.** A catalog test cannot see these. They are the same defect, in copy the past fixes did not reach:
- `functions/src/web/pages.ts` `wrappedPage`: `` `${n} eventos` ``, `` `${n} personas apuntadas` `` in the page head. This is read-site copy, so it can use `msg()`. `read-site-shared-list-rules` (ongoing, landed on dev in #691) moved only the org and barrio counts.
- `functions/src/wrapped/render/copy.ts` (image-only strings, kept local by design, per its header): `peopleTitle` «1 vecinos», `peopleSubtitle` «1 se apuntaron», `postersTitle` «1 años de carteles», `statsFullestCount` «1 apuntados» / «de 1 plazas». Its neighbours `eventsTitle`, `newsTitle` and `eventCount` already branch on `n === 1`. `read-site-shared-list-rules` lists Wrapped as out of scope.
- `packages/shared/src/email/registrationEmailTemplate.ts` `capacityLabel`: the uncapped branch handles 1, but the capped branch reads «1 de 1 plazas ocupadas».
- `packages/shared/src/export/recordsExport.ts` cuota rows: «(1 pagos)».

The guarded hand-written sites are fine: `bookReservaSlot`'s limit message branches on `=== 1`, and `registerToEvent`'s «grupos de N personas» only runs when `groupSize > 1`.

Dependency category: **in-process**. The check is a pure function over a JSON file, tested directly.

No open PR touches `packages/i18n`, `catalogCopy.test.ts` or the straggler files (#745 and #660 are e2e and release). No decision covers count copy.

## Design

**1. `packages/i18n/test/countPlurals.test.ts` (new)**, next to `keyParity.test.ts`, run by `pnpm i18n:test` in CI's unit lane. Two assertions over every string leaf of every supported locale:
- **Every `plural,` parses.** After `PLURAL_RE` replaces the plurals, no `plural,` is left. This turns the skill's `=0` trap and any nested brace into a red test instead of raw ICU on screen. `PLURAL_RE` is exported from `index.ts` (or a small `pluralSpans(tpl)` helper is), so the test reads the formatter's own regex, not a copy of it.
- **No count sits bare next to a plural word.** The two-part rule above, over the remainder, skipping `*.other` leaves that have a `*.one` sibling. A hit fails with the key, the matched span and the fix: wrap it as `{x, plural, one {…} other {…}}`, or add it to the allowlist with a reason.
- **The allowlist** is a `Record<key, reason>` in the test file. It starts with `groups.tasks.dueAt` and `groups.cosateca.reserva.confirmBody` ("an hour, not a count"). A stale entry fails too: the key must exist, and must still match the rule. That keeps the list from rotting.

Illustrative only:

```ts
const ALLOW: Record<string, string> = {
  'groups.tasks.dueAt': 'a las {time}: an hour, not a count',
  'groups.cosateca.reserva.confirmBody': 'a las {time}: an hour, not a count',
};
```

**2. Fix the catalog straggler.** `village.vocabulary.seeAll` becomes `{count, plural, one {Ver la palabra} other {Ver las #}}`, and its row goes into `catalogCopy.test.ts`'s `it.each`. That test file keeps its role of pinning exact wording; the new test is the net under it.

**3. Fix the server stragglers in place**, each with a 1/N assertion beside its existing test:
- `wrappedPage` (`pages.ts`): take the two figures from catalog ICU plurals through `msg()`, as the read site already does for counts. Reuse an existing `village.wrapped.*` key where one already says this; otherwise add one under `village.wrapped`.
- `wrapped/render/copy.ts`: branch on `n === 1` the way its neighbours already do (`peopleTitle`, `peopleSubtitle`, `postersTitle`, `statsFullestCount`). It stays local, as its header decides.
- `capacityLabel`: «1 de 1 plaza ocupada» when `maxAttendees === 1`.
- `recordsExport` cuota row: «(1 pago)».
- One `changelog.d/` entry and one `docs/qa/pending/` entry, the way b353cf3a shipped (Migration: none).

**4. Fix the skill.** `i18n-add-string` gets an example that parses (`one`/`other` only, with a note that `applyPlurals` supports nothing else). It points to `countPlurals.test.ts` as the check, and its `apps/web` / `next-intl` sections give way to the two real consumers, `useT()` and the read site's `msg()`.

**Alternatives considered:**
- *Flag every placeholder whose name looks numeric (`count`, `n`, `total`, …) outside a plural.* Lost: it misses `{events}`, `{alDia}` and `{pendiente}`, which b353cf3a fixed, and it flags about 30 correct label, ordinal and index messages, so the allowlist would dwarf the rule.
- *Keep pinning keys in `catalogCopy.test.ts`.* That is the current state, and it has needed three after-the-fact fixes.
- *A source-scan test for template literals like `` `${n} <plural>` `` in `functions/` and `packages/shared/`.* Lost: code has no catalog structure to anchor on, so it would be noisy. Server copy is better moved onto `msg()` and the catalog, where this guard does reach it.

**Testing strategy:** the new test runs on the real catalog. It also gets three small fixture cases that prove the rule: a bare `{count} personas` fails, a stale allowlist entry fails, and an unparseable `=0` plural fails. The keys `catalogCopy.test.ts` already pins stay as wording tests. No shallow test becomes redundant: the new test proves the shape, the pinned rows prove the words.

## Paths

As of 2026-11-21:
- `packages/i18n/test/countPlurals.test.ts` (new)
- `packages/i18n/index.ts` (export `PLURAL_RE` or a `pluralSpans` helper)
- `packages/i18n/messages/es.json` (`village.vocabulary.seeAll`; any `village.wrapped.*` key `wrappedPage` needs)
- `apps/mobile/lib/__tests__/catalogCopy.test.ts`
- `functions/src/web/pages.ts` (`wrappedPage`), plus a case under `functions/src/__tests__/web/`; no test calls `wrappedPage` today
- `functions/src/wrapped/render/copy.ts`, and `functions/src/__tests__/wrapped/render.test.ts`
- `packages/shared/src/email/registrationEmailTemplate.ts` (`capacityLabel`), and `packages/shared/test/email/registrationEmailTemplate.test.ts`
- `packages/shared/src/export/recordsExport.ts`, and `packages/shared/test/export/recordsExport.test.ts`
- `.agents/skills/i18n-add-string/SKILL.md`
- `changelog.d/` (new entry), `docs/qa/pending/` (new entry)

## Approval

Pre-approved: "fixing a defect whose correct behaviour is not in dispute — a crash, a leak, a wrong result, code that breaks its own docs or tests — unless the fix changes a product rule". «Ver las 1» and «1 vecinos» are wrong results in Spanish, fixed the same way three earlier commits fixed the same bug. The guard itself falls under "test and CI health — flakes, missing coverage, a broken lane", and the skill fix under "docs, plans and comments that contradict the code". No product rule, stored data or running cost changes. No hard stop.

## Out of scope

- Splitting or reorganising `es.json` (*Enhance*: never propose).
- Moving Wrapped image copy into the catalog: its header keeps image strings local by design.
- Wording choices beyond agreement in number, such as «personas» vs «integrantes» (left as a copy decision in `read-site-shared-list-rules`).
- Plural categories beyond `one`/`other` (`=0`, `many`), and a real ICU parser. Spanish needs neither today; the guard only makes sure nobody writes one the formatter cannot read.
- Hand-written Spanish elsewhere in `functions/` (notification and callable error copy) that has no count defect today.
