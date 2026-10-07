# Store metadata — Google Play & App Store

Everything the two consoles ask for that is **not** derivable from the code, in
one place, so the answer typed into a form is reviewable in git and identical
next release.

| File | Feeds |
|---|---|
| [listing-es-ES.md](listing-es-ES.md) | Play → Grow → Store listing · ASC → App Information + Version metadata |
| [play-declarations.md](play-declarations.md) | Play → Policy → **App content** (every item in the checklist) + Store settings |
| [app-store-declarations.md](app-store-declarations.md) | ASC → App Privacy, Age Rating, App Review Information |
| [assets.md](assets.md) | Graphic assets required by both stores |

The runbook for the *process* (publishing, console access, signing, build
gotchas) is [release-runbook.md](release-runbook.md). This folder is the
*content*, and that file is the process.

## The rule that matters

**Every declaration here is a claim about the code.** Play's Data safety form
and Apple's privacy labels are enforced by comparing them against the shipped
binary's behaviour, and a mismatch gets the app pulled, not warned. So:

- Adding a permission, an SDK, or a new field on `users`/`persons` → update
  [play-declarations.md](play-declarations.md) and
  [app-store-declarations.md](app-store-declarations.md) **in the same PR**, and
  re-submit both forms at the next release.
- `blockedPermissions` in [apps/mobile/app.config.ts](../../apps/mobile/app.config.ts)
  is what keeps camera, microphone, background location and legacy storage out
  of the manifest. Removing a block is a declaration change.
- The privacy policy ([../legal/politica-de-privacidad.md](../legal/politica-de-privacidad.md),
  served at `/legal/privacidad`) must be a superset of both forms.

## Status of the store-side blockers

- ✅ **In-app reporting and blocking shipped.** Every comment that is not yours
  carries a report affordance (seven reasons) and a *block this person* row;
  blocked authors vanish from your screens, Ajustes → Personas bloqueadas
  unblocks them, and Administración → Denuncias is the moderator queue. Answer
  Play's content-rating UGC questions and Apple's guideline 1.2 with this.
- ✅ **Public account-deletion URL:** `https://cultuvilla.es/legal/eliminar-cuenta`.
  Paste it into Play's Data safety form; the in-app path (Ajustes → Eliminar
  cuenta) still exists and is what Apple looks for.
- ✅ **Export compliance** is declared in the binary
  (`ITSAppUsesNonExemptEncryption: false`), so ASC stops asking per build.
- ⚠️ **Reviewer account — decided, not yet created.** A dedicated review
  mailbox, whose password goes in the console (the app itself has none). The
  prep steps, the exact field values and the English instructions text are in
  [play-declarations.md](play-declarations.md#app-access-sign-in-details).
- ⚠️ **Sign in with Apple** (guideline 4.8) before the first iOS submission,
  while Google Sign-In is on the login screen.

> **Legal URLs moved to Spanish (2026-09).** The pages are now `/legal/privacidad`
> and `/legal/terminos`, and Hosting 301s the old `/legal/privacy` and `/legal/terms`.
> Updating the URL declared in both consoles is a task in
> [village-first-urls-prod-finish.md](../plans/ready/village-first-urls-prod-finish.md).
