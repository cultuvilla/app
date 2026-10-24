# Web studio — desktop authoring for creators

**Priority:** medium — authors are asking to write articles from a PC; they are few but produce what everyone else reads
**Landed:** none
**Gate:** none
**Next:** once the PR deploys to dev, pair a real phone at villa-events.web.app/estudio and write, edit and delete an article, then edit it in the app and back

## Goal

A separate, signed-in web app (the *studio*) where existing Cultuvilla users write
articles on a big screen, with an authoring UI and UX designed for the desktop. The
app stays the product and the read site stays anonymous.

## Context

Users report that they want to write articles from a PC. The web is a read site
today: `readSite` server-renders public pages, ships no Firebase client SDK, and makes
one write (the `/embajadores` lead). That decision record says the next web write
needs its own yes, and names "a non-anonymous web audience" as the trigger to revisit
([web-is-a-read-site.md](../../decisions/web-is-a-read-site.md)).

**Decided 2026-10-24 (user):** build a dedicated authoring web app instead of adding
writes to the read site, starting with articles.

Why a separate app rather than an editor page inside `readSite`:

- The read site stays pure: anonymous, server-rendered, no client JS, cached at the
  edge. One authenticated page there would become the place every later desktop
  request lands.
- Desktop authoring will not stop at articles (events, carteles, village info), so
  it needs a home with room to grow.
- The reason the Expo web export was dropped (the web forced the *app's* data layer
  onto the JS SDK, which has no offline cache) no longer applies. Services import
  Firebase through the SDK seam
  ([sdk/README.md](../../../packages/shared/src/firebase/sdk/README.md)): a web
  bundle resolves the JS side and the app keeps `@react-native-firebase`.

## Design

- **Workspace:** `apps/studio/`, a React DOM single-page app (Vite), consuming
  `@cultuvilla/shared` models, services and the design-system tokens. It shares
  models and services with the app, **never screens**. (Don't use `apps/panel/`:
  that name belonged to the founders' panel, which now lives in `cultuvilla/business`,
  and an untracked `node_modules` of it is still on disk there.)
- **Served** as static files by Hosting under `/estudio/**`, with a rewrite to its
  `index.html` ahead of the `readSite` catch-all. `estudio` joins
  `RESERVED_ROOT_SEGMENTS` ([urls.ts](../../../packages/shared/src/utils/urls.ts)).
- **Sign-in by pairing with the app, no web accounts.** The studio shows a QR
  code holding a one-time pairing id. The signed-in app scans it and calls a
  callable that binds the id to the user's uid. The studio, waiting on that id,
  receives a short-lived **custom token** and calls `signInWithCustomToken`. Accounts are
  still created only in the app, and only people who already use it can write. The
  pairing doc is function-owned, single-use and expires in minutes.
- **Writes go through the existing Firestore and Storage rules as the real user**
  (`createNewsPost`, `uploadNewsImage`, …). No Admin-SDK write path, so authority is
  never duplicated. The `generateImageVariants` trigger already handles the images.
- **Editor:** a DOM rich-text editor (Tiptap/ProseMirror) for headings, paragraphs,
  marks, links, `@`-mentions and captioned images. A converter between the editor
  document and `NewsBlock[]` lives in `packages/shared`, with round-trip tests, so an
  article written in the studio edits correctly in the app and vice versa. The
  app-side converters now in
  [BlockEditor.tsx](../../../apps/mobile/components/feature/BlockEditor.tsx) move to
  shared next to it.
- **First release scope:** pairing, the list of the user's articles, create / edit /
  delete an article with cover, category and organizers. Nothing else.
- **Boundary**, now in the decision record
  ([web-is-a-read-site.md](../../decisions/web-is-a-read-site.md#the-web-studio-estudio-2026-10-24)):
  the studio is for *authoring* by existing users. It is never a second copy of
  the app (no feed, no sign-up, no event registration). The read site's rules are
  unchanged.

## Built (first release)

- **Pairing:** [studioPairing.ts](../../../functions/src/studio/studioPairing.ts)
  — `createStudioPairing` and `claimStudioPairing` (unauthenticated, for the
  studio) and `inspectStudioPairing` / `approveStudioPairing` (for the signed-in
  app). The QR code holds `https://<site>/estudio/vincular/<id>`, so the phone's
  own camera opens it: Android's app link (and dev's AASA) route it into the app
  at [estudio/vincular/[id].tsx](../../../apps/mobile/app/estudio/vincular/[id].tsx);
  where the OS does not claim the path (prod iOS, whose AASA lags on purpose) the
  studio answers on the phone with a `cultuvilla://` button. No scanner in the
  app, so it ships by OTA. The claim needs a secret the QR code never carries,
  the app shows the studio's 4-character code before approving, pairings are
  single-use and live five minutes, and the studio's session is tab-only.
- **Content model:** [newsDocument.ts](../../../packages/shared/src/models/news/newsDocument.ts)
  converts the Tiptap document to and from `NewsBlock[]` (round-trip tests in
  shared, and a test that loads its output into the studio's editor schema). The
  app's editor converters moved beside it
  ([newsEditorBlocks.ts](../../../packages/shared/src/models/news/newsEditorBlocks.ts)),
  and mention candidates are one shared service
  ([mentionCandidateService.ts](../../../packages/shared/src/services/mentionCandidateService.ts)).
- **Studio:** [apps/studio/](../../../apps/studio/) — Vite + React + Tiptap, built
  by the deploy and copied to `web/dist/estudio` by `build-web-static.mjs`. It
  reads its Firebase config from Hosting's `/__/firebase/init.json`, so one build
  serves every env.

Not verified yet: the end-to-end pairing on a real phone, and the editor in a
real browser, both need the PR deployed to dev (see **Next**).

## Costs accepted

- Two article editors (app and studio): separate UI code, one shared content model.
- New running costs: the pairing callable(s) and static hosting.
- Infra: none new. Minting custom tokens needs `roles/iam.serviceAccountTokenCreator`
  on the functions service account, which email-code sign-in already required: it
  is granted in all three envs, recorded in
  [env-parity.json](../../../infra/env-parity.json) and checked by
  `pnpm check:custom-token-signing`.

## Out of scope

- Web sign-up or any sign-in other than app pairing.
- Events, carteles, places, village editing (later candidates, each its own yes).
- Moderation or admin tools.
