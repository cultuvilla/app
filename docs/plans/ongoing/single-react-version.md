# One React version in the mobile dependency tree

**Priority:** high — two Reacts in one jest run fail mobile suites at random with "Invalid hook call"

**Landed:** none
**Gate:** none
**Next:** find what resolves react@19.1.0 next to the declared 19.2.3, pin one version (pnpm override or peer fix), and prove the native fingerprint is unchanged

## Context

As of `72380de0` (origin/develop, 2026-11-28).

- `apps/mobile` and `apps/studio` declare `react: 19.2.3`, but `pnpm-lock.yaml` also holds `react@19.1.0`, and most of the native tree (`react-native@0.85.3`, `expo@56.0.12`, `@react-native-firebase/*`, `expo-font`, `react-dom@19.2.3(react@19.1.0)`) is resolved against 19.1.0. `react-test-renderer@19.2.3` is installed twice, once per React.
- The merge-queue run for #767 (46133871131) failed in mobile jest with `Invalid hook call` in `RegisterFab.test.tsx`, `EntityComments.test.tsx` and `VillageHomeBody.test.tsx`: the stack shows `react@19.1.0`'s dispatcher under `react-test-renderer@19.2.3`'s renderer. The re-run passed, so it depends on resolution order, not on the diff.
- Two copies of React in a Metro bundle is a crash on device, so confirm which one the app bundle ships.

## Approval

Pre-approved: "test and CI health — flakes" and "fixing a defect whose correct behaviour is not in dispute". One React is the declared state. If the fix changes the native fingerprint (`eas fingerprint`), stop and report: that needs a store build.
