# Breaking changes for installed clients, and the hard wall

Both store apps are published, and installed binaries lag: iOS and Android users
update on their own schedule, weeks behind a promotion. Meanwhile the backend
(functions, rules) deploys on every merge to `develop`, `beta` and `main`. That
means one dangerous window:

> **New backend live, old binary still installed.**

OTA updates (`beta` channel, `runtimeVersion: fingerprint`) narrow it for JS,
but do not close it. An OTA reaches only binaries built after `expo-updates`
landed, only on the matching fingerprint, and only after the user restarts the
app. A native change ships no OTA at all.

This document defines what counts as **breaking**, how to avoid it, and how
`config/appVersion.minSupported` (the *hard wall*) gets raised when a break
cannot be avoided. `AGENTS.md`, the CI guards and `prepare-release` all link
here instead of restating it.

## Definition

A change is **breaking** only if it makes an already-installed **older** client
*malfunction*: it errors, crashes, has its writes rejected, or has a converter
throw. A client that misses a new feature, sees stale data or works in a
degraded way is not broken.

Four kinds of backend change are breaking:

1. **A callable or HTTPS endpoint the old binary calls is removed, renamed or
   tightened.** Tightened means a new required argument or a narrower accepted
   shape, so the old call now fails.
2. **A Firestore or Storage rule is tightened** so it rejects a write the old
   binary still makes.
3. **A stored document shape changes so that the old binary's strict Zod
   converter throws on it.** Every read goes through `makeConverter` →
   `schema.parse`, so this works in both directions:
   - *Looser:* new code stops writing a field that old clients require, or
     writes a value they reject, such as a new enum member. Old clients throw.
   - *Stricter:* new code requires a field that old docs lack. The **new** code
     throws, on every client and in functions alike, until a backfill runs. That
     is a deploy-ordering problem rather than an old-client one, and the
     `pre-deploy` backfill gate already handles it. It is listed here because
     the same schema diff produces both kinds of break.
4. **A callable's response shape changes** so the old binary's parsing fails.

Non-breaking by construction: new callables (including one shipped together
with the binary that calls it), new optional fields, new indexes, loosened
rules, and any purely client-side change.

Lean hard towards *not* walling: a false wall locks the whole fleet out until
the store serves the update, which is far worse than one missed edge.

## Expand → migrate → contract is the default

The default way to change something an installed client depends on is
expand → migrate → contract, not a breaking change. **A compatibility window
for installed clients is not a retrocompat shim.** The *No retrocompat shims*
rule in AGENTS.md is about our own code and our own data. A store binary we
cannot upgrade is a reader we do not control.

- **Expand** (release N): add the new shape and keep the old one. Write both. Read
  the new shape and fall back to the old one. Make the new field optional, or
  give it a default. Ship a new callable next to the old one. **Expand strands
  nobody and carries no trailer.**
- **Migrate** (soak): run the registered backfill so every stored doc has the
  new shape. Wait until `minSupported` (or the real installed base) has moved
  past every binary that reads only the old shape.
- **Contract** (release N+k): remove the old shape or callable, and stop the
  legacy write. **This is the only commit that can break anyone, and the only one
  that may carry `Breaking-Client:`.** If the drain is complete, it carries
  `Breaking-Client-Exempt:` instead.

## Trailers

Declarations are git trailers on the commit that makes the change, so they are
reviewed in the PR diff. They are line-anchored, so keep each one on a single
line — and short: commitlint (`@commitlint/config-conventional`) caps footer
lines at 100 characters, so the whole line, key included, must fit. The
`Breaking-Client-Exempt: ` key alone takes 24, leaving ~75 for the reason; put
any longer explanation in the commit body or the PR description.

| Trailer | Meaning | Effect |
|---|---|---|
| `Breaking-Client: <reason>` | This change strands installed clients older than this release. | Satisfies both CI guards. `pr:land` exits `30` and hands the PR to the user, because walling the fleet is a product call. At release, `minSupported` is raised to the release carrying the fix. |
| `Breaking-Client-Exempt: <reason>` | CI sees something that looks breaking, but it provably strands nobody. Examples: the callable's last call site shipped below the live `minSupported`; the field is still always written (the expand step); the doc is rewritten whole on every deploy. | Satisfies both CI guards. Never moves the wall and never hard-stops. |

The reason must be evidence, not confidence. For example: *"last called in
1.1.0 (git log -S); prod minSupported is 1.2.0"*. **If you cannot name the
version, use `Breaking-Client:`.**

Automatic `minSupported` rollup from `Breaking-Client:` trailers at release time
is being built in a sibling PR. Until it lands, raising the wall is the manual
step described under *How the wall is set*.

## The CI guards

The `breaking-changes` job in `ci.yml` runs on every pull request. It runs two
scripts, and both read only git:

- **`scripts/check-callable-removal.mjs`** finds every function exported from
  `functions/src/index.ts` whose module defines it with `onCall` or `onRequest`.
  A wrapper it cannot classify also counts. If one of those exists at the PR's
  merge-base but not at its head, and no commit in the PR has either trailer,
  the job fails. A rename counts as a removal of the old name. Removing a
  trigger or a scheduler passes.
  - **Blind spot:** a callable whose signature or response *tightens*.
  - **False positives:** web-only `onRequest` endpoints that no binary calls
    (`robotsTxt`, `ogRenderer`). Declare these with `Breaking-Client-Exempt:`.
- **`scripts/check-schema-change.mjs`** diffs the stored schemas under
  `packages/shared/src/models/` (form schemas excluded).
  - **Stricter** means a new required field, a lost
    `.optional()`/`.nullish()`/`.default()`/`.nullable()`, or a new `.strict()`.
    It needs a registered `pre-deploy` backfill added or changed in the same PR,
    or a trailer.
  - **Looser** means a required field removed or made optional or nullable. It
    needs a trailer: no backfill fixes an installed binary.
  - **How it works:** it is a line-wise tripwire, not a type checker. Its header
    lists what it cannot see: enum widening, type narrowing, spreads and
    `.extend()`, and changes inside a referenced schema.
  - **What backs it up:** the conformance gate on every promotion checks that
    stored data actually parses.

Replayed over the last 150 merged PRs, the guards would have stopped:

- 3 callable removals: one real (`acceptInvite`) and two web-only endpoints.
- 3 snapshot-schema reshapes, each satisfiable with `Breaking-Client-Exempt:`
  (the snapshot doc is rewritten whole).
- 1 real loosening (the Wrapped reshape).

Every past tightening that shipped with its backfill passes.

Still agent discipline, unchecked: rule tightening (`test:rules` tests rules
but does not compare them with what old binaries write) and response-shape
changes.

## How the wall is set

`config/appVersion.minSupported` is the hard wall. Clients read it on launch
(`appConfigService`, `resolveVersionGate`), and anything older is blocked until
it updates.

- It is never raised as a side effect. The deploy's *Announce the shipped version* step
  preserves the stored value when `min_supported` is blank.
- When a release carries a `Breaking-Client:` change, raise it to that release's
  version with **Actions → Set App Version** (`set-app-version.yml`), once the
  stores actually serve that version. The write is refused above what the store
  serves, because a wall with no downloadable build behind it blocks everyone with
  nowhere to go.
- Raising it in prod is the user's decision for that specific run.

See *Versioning & releases* in `AGENTS.md` for `latest`, `APP_STORE_VERSIONS`
and the deploy-time announce.
