# Firebase SDK seam

Every Firebase call in `packages/shared` and `apps/mobile` imports from here,
never from `firebase/*` or `@react-native-firebase/*` directly.

| File | Resolved by | SDK |
|---|---|---|
| `firestore.ts`, `auth.ts`, `functions.ts`, `storage.ts` | Node (vitest, emulator tests) | Firebase JS SDK |
| `*.native.ts` | Metro and jest-expo (iOS/Android) | `@react-native-firebase/*` |

The app runs the native SDK for its persistent offline cache
(docs/plans/ongoing/offline-first-village.md); the shared tests keep running the
JS SDK against the emulators. Both expose the same modular names, and
`sdkParity.test.ts` fails if a value export exists on one side only.

Types always come from the JS file, so call sites are type-checked against the
JS SDK. Known runtime divergences are documented in each `.native.ts`.
