---
name: parallel-agent-workflow
description: Use whenever an agent works inside a worktree under `.claude/worktrees/` and will run Firebase emulator tests (`pnpm test`, `test:rules`, `test:integration`, `test:functions`), especially when other agents may be doing the same — an orchestrated batch, or any second session. Covers the per-worktree emulator slot (`scripts/agent-env.sh`), the machine's concurrency ceiling, and teardown. Per-slot Metro and Android emulators are NOT built here.
---

# Parallel agent workflow

Several agents can work in this repo at once, each in its own worktree. Code is
isolated by git; **emulators are not**, unless the worktree holds a slot. Without
one, every emulator suite binds `firebase.json`'s ports (8080, 9099, 5001, 9199),
and a second suite on the machine evicts the first or talks to its emulators. The
symptom is failing tests, never "port in use" — so don't debug a red emulator run
in a worktree before checking this.

## The procedure

1. **Once per worktree, before any emulator test:**

   ```bash
   source scripts/agent-env.sh
   ```

   It allocates a slot (a block of 100 ports from 20000 up, in the machine-wide
   registry `~/.agents/slots.json`), initialises the `.agents/_shared` submodule,
   runs the install steps from `.agents/orchestrate.config.json` (pnpm + the
   separate `functions/` npm install), and writes `firebase.agent.json` — the
   repo's `firebase.json` with every emulator moved into the slot. Report the slot
   number it prints.

   If `scripts/agent-env.sh` itself is missing, the submodule is empty (git does
   not populate it in new worktrees): run `git submodule update --init` first.

2. **Run tests normally.** `scripts/run-tests-with-emulators.mjs` starts from
   `firebase.agent.json` whenever it exists and points the tests at its ports, so
   every `pnpm test*` script is slot-aware with no flags. The slot lives in that
   file, not in an exported variable, so it survives across separate shell
   commands.

3. **Mind the machine ceiling.** At most `maxConcurrentEmulatorSuites` (in
   `.agents/orchestrate.config.json`) emulator suites run at once on this host.
   Prefer targeted unit tests locally and let the PR's CI run the full gate, as
   the Development workflow already asks of worktrees.

4. **Don't tear down your own slot.** Freeing it is the leader's (or the user's)
   job when the worktree is reaped:

   ```bash
   (cd .claude/worktrees/<name> && source scripts/agent-env.sh --clean)
   git worktree remove --force .claude/worktrees/<name>
   ```

## Not covered

- **Per-slot Metro and Android emulators.** A worker cannot run its own Metro
  or AVD; UI work that needs a device goes to the user's main checkout (see the
  `drive-android-avd` skill). `pnpm test:e2e:android` still uses the default
  ports.
- **The main checkout** never holds a slot: `agent-env.sh` is a no-op there, and
  everything uses `firebase.json`'s ports as before.
