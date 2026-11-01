# apps/studio — the web studio

A separate, signed-in React app (Vite + Tiptap) where existing users write
articles on a desktop. Hosting serves its build under `/estudio`. Read the
decision record's studio section first:
[web-is-a-read-site.md](../../docs/decisions/web-is-a-read-site.md#the-web-studio-estudio-2026-10-24).

- **Authoring only.** Never a second copy of the app: no feed, no sign-up, no
  event registration. A new kind of content here needs the user's yes.
- **Sign-in is pairing with the app**, nothing else. [StudioAuth.tsx](src/auth/StudioAuth.tsx)
  is the only file that touches Firebase Auth; every other read and write goes
  through `@cultuvilla/shared` services, as the real user, under the rules.
- **One content model.** The editor's document converts to `NewsBlock[]` only
  through `packages/shared/src/models/news/newsDocument.ts`. A new mark or block
  type goes there first, with a round-trip test, and must still parse in the app.
- **Strings** come from `@cultuvilla/i18n` (`studio.web.*`); a test fails on a
  key the catalog lacks.
- **One build, every env:** the Firebase config is read at runtime from
  Hosting's `/__/firebase/init.json` (Vite proxies it to dev locally).

```bash
pnpm studio:dev        # local, against the dev project (port 5175)
pnpm studio:test       # vitest
pnpm studio:typecheck
pnpm studio:build      # what the deploy runs before build-web-static.mjs
```
