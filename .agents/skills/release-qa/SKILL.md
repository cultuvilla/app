---
name: release-qa
description: The device QA ledger for the Cultuvilla app. Use when (a) landing any change that adds or changes something a user can see or do — write its QA entry in `docs/qa/pending/` (or say in one line why it needs none); (b) running the QA pass — an agent drives the real app on an Android AVD against seeded emulators and witnesses every pending entry, at a release cut or whenever Álvaro asks; (c) a full pass over every screen (the first run, or after a large rework). Triggers: "haz la pasada de QA", "QA the app", "prueba la app", "what needs testing", "add a QA entry", or `prepare-release` reaching its QA step.
---

# Release QA — claims written with the code, witnessed on a device

Maestro (`apps/mobile/e2e/native/`) proves the flows someone scripted. This
ledger covers the rest: the agent that writes a change knows best how it breaks,
so it writes that down **with the change**, and a later pass by an agent driving
the real app witnesses every claim. Nothing runs during the cycle; entries
accumulate in `docs/qa/pending/`, one file per change.

## Part A — writing an entry (every user-facing change)

Every PR (or direct push) that adds or changes something a user can see or do
answers: **what must be seen on a device to believe this works?** Either:

- **An entry** — `docs/qa/pending/<slug>.md` in the same change. `<slug>` = the
  branch name or a short kebab name.
- **"No QA entry: <why>"** — one line in the PR description / commit body: a
  jest/vitest/Maestro test already proves it, or nothing user-visible changed.

**Only claims a device can verify.** What a unit test can check is a unit test.
An entry is what remains: the gesture, the layout, the navigation, the write a
real tap produces, what only shows with real-shaped data. One file per change,
never a shared list (every PR would conflict on it).

### Format

Spanish, like the app:

```markdown
---
verifier: agent            # agent | human
accounts: user             # none | user | admin | superadmin | joiner | fresh | admin+user …
platform: any              # any | android | ios
data: seed                 # seed | mirror:<village>   (see Part B §1)
source: <PR # or commit sha>
---
# <La afirmación, como comportamiento: «Apuntarse dos veces no crea dos inscripciones»>

**Preparación:** el estado que hace falta y cómo conseguirlo (qué fixture, qué pantalla).

**Pasos:**
1. …

**Esperado:** lo que enseña la pantalla, y qué documento cambia (ruta + campo)
si hay escritura — `fs.mjs` lo comprueba.

**Roto se ve así:** el síntoma concreto de la regresión.
```

- **`verifier: agent`** — drivable and observable through screenshots, the UI
  tree and Firestore. Logging in as any seeded fixture counts (§3).
- **`verifier: human`** — needs what the agent lacks: a real push on a phone,
  the camera, haptics, smoothness, two physical phones, a real store install.
- **`platform: ios`** — this machine has no Mac and Álvaro no iPhone: the entry
  is Jaime's, handed over once, never "blocked on Álvaro".
- Steps name `testID`s where they exist; the runner taps by `id:`.

## Part B — the pass

**When:** at a release cut, on the `release/<version>` head before its PR merges
into `beta` (`prepare-release` §4b) — a ❌ blocks that merge; and **whenever
Álvaro asks**, on `origin/develop`. Never propose a pass as a step towards a cut:
cuts are his.

**Inputs:** at a cut, exactly the entries at the release commit
(`git ls-tree --name-only <sha> docs/qa/pending/`); on demand, every entry on
`origin/develop`. Entries added later belong to the next pass.

### 1. Code, backend and data

Work in your own detached worktree, never the main checkout:

```bash
git -C ~/githubs/cultuvilla/app fetch origin
git -C ~/githubs/cultuvilla/app worktree add .claude/worktrees/qa-<name> --detach origin/develop
cd ~/githubs/cultuvilla/app/.claude/worktrees/qa-<name>
source scripts/agent-env.sh          # deps + this worktree's own emulator ports
```

**Backend = local Firebase emulators with the e2e seed** (`scripts/seed/e2e.mjs`,
fixtures in `scripts/data/seed-fixtures/e2e/fixtures.mjs`). Hermetic: the agent
signs in as any fixture itself and nothing real can be touched.

**On the repo's default ports, not the worktree's slot.** The APK hardcodes
8080/9099/5001/9199 at `10.0.2.2`, and @react-native-firebase rewrites a
`127.0.0.1` emulator host to `10.0.2.2` on an AVD — so `adb reverse` onto slot
ports cannot work (tried 2026-11-18: `Failed to connect to /10.0.2.2:9099`).
Check they are free (`qa.sh ports`), set the slot config aside for the pass,
and run the backend in the background, bounded:

```bash
mv firebase.agent.json firebase.agent.json.off      # restore it after the pass
PATH=$PWD/node_modules/.bin:$PATH node scripts/run-tests-with-emulators.mjs --label seed pnpm seed:e2e \
  --label hold node ~/githubs/cultuvilla/app/.agents/skills/release-qa/scripts/hold.mjs   # run_in_background
# stop:  touch .qa-stop   (also stops itself after QA_MAX_HOURS, default 6)
# PATH: the wrapper spawns a bare `firebase`, which is only on PATH under a pnpm script.
# Ready when the log shows `[qa-hold] emulators up` (functions build + seed ≈ 2 min).
```

While it runs, another session's default-port emulator suite cannot start;
keep the pass short or tell the other session.

An entry marked `data: mirror:<village>` needs real shapes and counts: with the
emulators up, `FIRESTORE_EMULATOR_HOST=127.0.0.1:<firestore port> pnpm
mirror:village --municipality=<village>` copies it in (read-only on the source;
AGENTS.md § Mirroring). Fixture logins still work; the mirrored village's real
users cannot be signed into.

### 2. The device and the build

- **Your own AVD on your own port.** `adb devices` first: other sessions'
  emulators (other repos too) are not yours. Boot e.g.
  `emulator -avd Cultuvilla_E2E -port 5610 -no-window -no-snapshot-save -gpu swangle_indirect`
  (run_in_background), and pin every command with `QA_SERIAL=emulator-5610`.
  Android 16 needs `swangle_indirect` (the map crashes the default renderer).
- **The emulator-armed release APK**, bundle baked in, so the device runs exactly
  the commit under test — no Metro:
  ```bash
  JAVA_HOME=/usr/lib/jvm/java-17-openjdk node scripts/build-android-e2e-apk.mjs   # ~4 min warm, ~15 cold
  adb -s $QA_SERIAL install -r -d apps/mobile/android/app/build/outputs/apk/release/app-release.apk
  ```
- Switch off Gboard's corrections once (it rewrites what Maestro types):
  `node -e "import('./scripts/lib/android-keyboard.mjs').then(m=>m.disableKeyboardRewriting({adbBin:'adb',device:process.env.QA_SERIAL,log:console.log}))"`.
- Picker images: `adb push` into `/sdcard/Pictures` + `adb shell content call --uri content://media --method scan_volume --arg external_primary`
  (as `scripts/run-android-e2e.mjs` does).

### 3. Driving and checking

```bash
export QA_SERIAL=emulator-5610 QA_ROOT=$PWD OUT=<scratchpad>/qa
S=.agents/skills/release-qa/scripts
$S/qa.sh login user            # admin | user | superadmin | joiner | throwaway | fresh
$S/qa.sh link perfil           # deep link (always name a route — bare cultuvilla:// never starts)
$S/qa.sh shot a1               # half-size PNG; then Read it
$S/qa.sh tree                  # texts + testIDs + bounds — find ids before tapping
$S/qa.sh run '- tapOn: { id: "profile-edit-action" }'
$S/fs.mjs get persons/e2e-person-user
$S/fs.mjs query events municipalityId EQUAL '"<id>"' 20
```

- Who the fixtures are (village admin, plain villager, super admin, joiner
  without a village, a throwaway to delete, a fresh account with no profile)
  and the seeded ids: `fixtures.mjs`. Order the run **by account**, so each
  login does a batch; two-account entries grouped by who acts first.
- Every Maestro trap the suite already paid for is in
  `apps/mobile/e2e/native/README.md` § *Maestro traps* — read it before the
  first `run`. Reuse its subflows (`confirm-alert.yaml`, `pick-photo.yaml`,
  `tap-until.yaml`, `type-into.yaml`) with `runFlow:`.
- **Verify the write, not just the screen**: every entry with a write gets an
  `fs.mjs` check of the doc path and field it names.
- Before calling anything a failure, take a settled screenshot again and re-read
  the entry against the code under test: an entry goes stale when a later change
  reworked its screen. A stale entry is fixed, not reported as a bug.

### 4. Report and act

- **Report** one row per entry: `entry | ✅/❌/⏭ | evidence (screenshot, doc path) | note`.
  At a cut it is a comment on the release PR; on demand, the final message.
  Findings get a second table: `H<n> | severity | area | what | status`.
- **A ❌ is a bug**: fix it through `fix-bug`, one worktree + PR each (a defect
  whose right behaviour is not in dispute is pre-approved). A ❌ that is really a
  product question goes to Álvaro, batched in one message. At a cut, a ❌ he
  decides to ship anyway becomes a plan in `docs/plans/ideas/` before the merge.
- `verifier: human` entries are not run: at a cut they become the testers'
  brief; on demand, list them for Álvaro (or Jaime, for `ios`).
- **Consume** what passed: a direct `docs(qa): …` commit on `develop` that
  `git rm`s exactly the passed files of that pass (never the whole folder). At a
  cut, only once the release PR has merged into beta. A ❌ entry stays until its
  fix is witnessed.
- **Promote what lasts**: an entry guarding a flow the Maestro suite lacks is a
  candidate for a flow (one deep flow per feature —
  `docs/decisions/e2e-feature-coverage.md`). List candidates; don't write them
  during the pass.
- Tear down: `touch .qa-stop`, `adb -s $QA_SERIAL emu kill`, then
  `source scripts/agent-env.sh --clean` and remove the worktree.

## Part C — a full pass

The first pass, or one after a large rework, covers the whole app rather than
the pending entries. Write a one-off set of entries first, then run Part B on
them, then consume them as usual — there is no permanent checklist to rot.

1. Inventory from the code, not memory: the routes under `apps/mobile/app/**`,
   the entity family (AGENTS.md § Entities), the solicitudes and the Buzón,
   groups (avisos, charla, cuota, tareas, cosateca, actas), profile, personas,
   settings, the version gate.
2. One entry per feature with `source: full-pass-<date>`, steps chosen for what a
   flow does **not** already prove: the Maestro table in
   `apps/mobile/e2e/native/README.md` says what each flow covers. Look for
   empty/error/loading states, second-user views, back navigation, long text,
   offline, deep links (`cultuvilla://<route>`) opening the right screen.
3. Commit the entries (direct `docs(qa)` commit), run, report, fix, consume.
