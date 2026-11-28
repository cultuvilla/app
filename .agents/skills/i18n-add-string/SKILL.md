---
name: i18n-add-string
description: Use whenever adding or changing a user-facing string in the React Native mobile app or the server-rendered read site. Encodes the shared message-catalog layout (packages/i18n/), the namespace-by-feature rule, the two consumers (useT() in apps/mobile, msg() in functions/src/web), the ICU plural form the formatter supports, and the catalog test that guards counts.
---

# Add a user-facing string

Cultuvilla has one message catalog, **`packages/i18n/messages/es.json`** (nested JSON, default locale `es`), and two consumers. Both go through the same formatter, `translate()` in [`packages/i18n/index.ts`](../../../packages/i18n/index.ts):

- **`apps/mobile`** — Expo / React Native, via the thin `useT()` adapter in `apps/mobile/lib/i18n.tsx`.
- **The read site** — the `readSite` Cloud Function, via `msg()` in `functions/src/web/copy.ts`.

A key added to the catalog is immediately available to both.

## When this applies

- Adding a new label, button text, error message, placeholder, or notification copy that an end user sees in the app or on the read site.
- Replacing an English or hardcoded-Spanish string left in source code with the catalog version.

**Carve-out:** hardcoded Spanish is allowed only in dev-only admin surfaces where i18n is not a current priority (AGENTS.md *i18n*). If in doubt: "would a non-admin user see this?" — yes → catalog.

## Procedure

### 1. Pick a namespace

Namespaces group strings by **feature area**, not by component: `event`, `village`, `groups`, `auth`. A component re-using strings from several namespaces is normal. Open the catalog, look for a namespace that fits; add a new top-level key only if none does.

### 2. Add the key (nested JSON)

Choose a stable, descriptive key. Avoid copy-as-key (`"Save"` as the key): copy changes more often than meaning.

```json
{
  "event": {
    "createButton": "Crear evento",
    "registrationConfirmed": "Te has apuntado correctamente."
  }
}
```

Placeholders are `{name}`.

### 3. Counts go through a plural

Any number next to a word that inflects for it is an ICU plural. Spanish has `one` (n = 1) and `other`; `#` is replaced with the number:

```json
{
  "event": {
    "attendeeCount": "{count, plural, one {# asistente} other {# asistentes}}"
  }
}
```

**The formatter supports exactly `{name, plural, one {…} other {…}}`** — no `=0`, no `many`, no nested braces inside a branch. Anything else renders as raw ICU text on screen. Need a zero case? Branch in the caller (`count === 0 ? t('x.empty') : t('x.count', { count })`).

[`packages/i18n/test/countPlurals.test.ts`](../../../packages/i18n/test/countPlurals.test.ts) enforces both halves (`pnpm i18n:test`): every `plural,` must parse, and no placeholder may sit bare next to a plural word (`{count} personas`, `de {n} plazas`, `Ver las {count}`). When it flags something that is not a count (`a las {time}` is an hour), add the key to its `ALLOW` list with the reason; a stale entry fails too.

Pin the exact wording of an important count with a row in `apps/mobile/lib/__tests__/catalogCopy.test.ts`.

### 4. Render the string

**Mobile:**

```tsx
import { useT } from '@/lib/i18n';

export function CreateEventButton() {
  const t = useT();
  return <Pressable><Text>{t('event.createButton')}</Text></Pressable>;
}
```

`useT()` takes the full dotted path. Pass values as the second argument: `t('event.attendeeCount', { count })`.

**Read site (`functions/src/web/`):**

```ts
import { msg } from './copy';

msg('event.attendeeCount', { count });
```

### 5. Other locales

Cultuvilla ships in Spanish only. If a non-`es` catalog is ever wired up, `keyParity.test.ts` makes every locale carry the same keys.

## What NOT to do

- **Don't hardcode Spanish in user-facing UI.** It bypasses the catalog, and the count test can't see it.
- **Don't write `` `${n} eventos` `` in code.** A count in server copy goes through the catalog (`msg()`) so the plural guard reaches it; copy that stays local by design (the Wrapped image strings in `functions/src/wrapped/render/copy.ts`) branches on `n === 1`.
- **Don't use the English copy as the key.**
- **Don't `as any` around a missing key.** Add the key.
- **Don't add the same string under two namespaces.** Pick one and reuse.
- **Don't concatenate translated fragments** (`${t('hello')} ${name}`) — use placeholders, so word order lives in the message.

## Companion skills

- None — this is self-contained.
