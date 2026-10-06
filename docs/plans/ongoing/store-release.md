# Store release runbook — Google Play and App Store

**Priority:** low
**Landed:** prod
**Gate:** none
**Next:** check Error Reporting for iOS `surface: auth` failures since 1.0.0 went live; if none, retire this plan into one decision doc

**Goal:** Cultuvilla public on both stores. **Done** — what remains is the
open items below, then retiring this plan.

## Done

- **iOS 1.0.0 live** on the App Store since 2026-09-04 (175 territories, free):
  <https://apps.apple.com/app/cultuvilla/id6804756586>. `APP_STORES.ios` filled in.
- **Play closed test completed** (12 testers × 14 days).
- **Play production approved**: 1.1.0, submitted 2026-09-08, public by
  2026-09-28 (<https://play.google.com/store/apps/details?id=com.cultuvilla.app>).
  `APP_STORES.android` + `APP_STORE_VERSIONS.android` filled in;
  `pnpm check:store-claims` 20 pass, 0 fail.
- **Play freeze lifted** 2026-09-28 (`PLAY_SUBMIT_PAUSED` deleted): every
  `beta` merge again submits Android to the closed track, iOS to TestFlight.
- AGENTS.md *Versioning & releases* updated.

## Next steps

1. Retire this plan. Keep one decision doc for the lesson below: *what sinks a
   release is server-side config no test in the repo can see.* Delete the rest.

## Open, before retiring

- **Sign in with Apple in TestFlight** (see *El rechazo de 1.0.0*). The logging
  that was the next step shipped in `55589f4a` (2026-09-03, `reportAuthError`),
  but nobody recorded what it caught. Check Error Reporting for `surface: auth`
  failures on iOS. If there are none since 1.0.0 went live, close this.
- **iOS Safari install banner.** The `apple-itunes-app` tag this doc says Safari
  draws its banner from never shipped: `+html.tsx` is ignored with
  `web.output: 'single'`. So iOS Safari visitors may get no install offer at
  all. The fix shipped on dev in #336 and reaches prod with the next
  promotion; the read site carries the tag from then on — see
  [app-only-transition.md](app-only-transition.md) phase 2.

## Handoff

This doc describes state that lives **outside the repo** and
drifts silently. Run `pnpm check:store-claims` before trusting any line of it.
Before 2026-09-11 (PR #331) that check never read `APP_STORES` correctly and
reported both platforms as empty. Release-pipeline follow-ups (the
`beta-build-and-submit` dispatch guard, four failed `mobile-release` runs on
26–28 Aug, announcing a version only once it is live in the store) moved to
[store-release-pipeline.md](../ideas/store-release-pipeline.md).

## Rollout status

| Step | Android (Play) | iOS (App Store) |
|---|---|---|
| Pre-release testing | ✅ closed test, 12 × 14 days | ✅ TestFlight internal + external |
| Submitted to production review | ✅ 2026-09-08 | ✅ 2026-09-02 (rejected, resubmitted) |
| Approved | ⏳ | ✅ 2026-09-04 |
| Listing public (`check:store-claims` PASS) | ⬜ | ✅ |
| `APP_STORES` URL filled | ⬜ | ✅ |

Legend: ⬜ pending · ⏳ in progress · ✅ done · ⚠️ blocked (note inline)

## Rollout of the village-first URLs

The Spanish, village-first URLs (#341, #348, #350) are on `develop` and live on
dev. Why each step is ordered this way is in
[spanish-village-urls.md](../../decisions/spanish-village-urls.md#hosting-and-native-links).
Tick these off in order:

1. ✅ **Promote `develop → beta → main`** as usual — done in v1.2.0 (2026-09-14; backfills auto-applied on beta and prod). Nothing extra by hand: the two
   backfills (`municipality-slug`, then `village-slug-denorm`) auto-apply before
   the gates on each deploy.
2. ✅ **Check prod after the deploy.** — verified 2026-09-14: 404, 301, AASA still legacy.
   - `curl -sI https://cultuvilla.es/pueblo-que-no-existe` → `404`
   - `curl -sI https://cultuvilla.es/legal/privacy` → `301` to `/legal/privacidad`
   - `curl -s https://cultuvilla.es/.well-known/apple-app-site-association` →
     still the **legacy** paths (`/event/*`, `/news/*`, `/village/*`, `/o/*`)
3. ⬜ **Update the legal URLs in both consoles** — only once step 2 passes. Before
   that, prod has no page at the new paths.
   - App Store Connect → App Information → Privacy Policy URL →
     `https://cultuvilla.es/legal/privacidad`
   - Play Console → Policy and programs → App content → Privacy policy → same URL
     (the Play API cannot set this field; it is a UI-only edit)
4. ⏳ **Ship an iOS build carrying the new routes** — iOS **1.2.1 (build 17)** submitted for review 2026-09-14 (AFTER_APPROVAL, phased). — any build made from `main`
   after step 1: `mobile-release`, then **App Store release** → `submit`. Wait
   until `status` says **READY_FOR_SALE**, not merely approved.
5. ⬜ **Widen prod's iOS deep links.** Set prod's `apple-app-site-association`
   `paths` to `["NOT /entrar", "NOT /entrar/*", "*"]` and update the pinned list
   in `packages/shared/test/ci/storeRelease.test.ts` in the same PR (and include
   `prod` again in `apps/mobile/__tests__/appConfig.test.ts`).
   - **Why it waits:** the live iOS 1.0.0 predates both the new routes and OTA, so
     a wider claim would open new links inside an app with no screen for them.

Android needs no step of its own: its path claim lives in the binary's manifest,
so the first Android build made after step 1 claims the new URLs by itself.
Until then, new links simply open on the web.

## Publicar iOS es automático (desde el 4 sep 2026)

`eas submit` sube el binario y se detiene ahí. Todo lo posterior es API de App
Store Connect, y hasta esta fecha se hacía a mano — por eso 1.0.0 estuvo
**aprobado y sin publicar** desde el 4 de septiembre sin que nada lo detectara:
el correo de Apple dice *eligible for distribution*, que es la aprobación, no la
publicación.

| Quiero… | Cómo |
|---|---|
| ver qué cree ASC que hay | Actions → **App Store release** → `status` |
| publicar una versión aprobada | `release` + `apply` |
| mandar un build a revisión | `submit` + `build_number` + `apply` |
| pausar un despliegue que va mal | `phased` + `state: pause` + `apply` |
| que un build nuevo se mande solo | `mobile-release` con `submitForReview` |

Las versiones se crean con **`releaseType: AFTER_APPROVAL`**: la aprobación
publica sola y nadie pulsa un botón. El seguro es el **phased release de 7
días** — sólo afecta a la actualización automática de quien ya tiene la app (una
descarga nueva siempre recibe la última), así que no cambia nada en 1.0.0 y
empieza a importar en la primera actualización.

**No hay clave de Apple en ningún portátil.** El `.p8` vive sólo como secreto de
repositorio, así que el workflow *es* la interfaz: despachable por la API de
GitHub, de modo que un agente puede publicar sin tener credenciales de Apple, y
dry-run por defecto.

`node scripts/appstore-release.mjs <cmd>` es el mismo código en local, y falla
con un mensaje claro cuando no encuentra credenciales. Los helpers puros están
cubiertos en `scripts/__tests__/appstore-release.test.mjs` (20 casos, con un ASC
falso), incluida la firma ES256 en formato JOSE — que es la diferencia entre un
token válido y un 401 sin explicación.

### Aprobado, publicado y *retirado de la venta* son tres cosas distintas

1.0.0 llegó a **Ready for Distribution** —aprobado y publicado— y aun así no
aparecía en ninguna tienda: la app estaba **removed from sale**, disponible en
cero territorios. La versión no dice nada de eso; el aviso vive en *Pricing and
Availability*, otra pantalla.

Se arregla a mano (App Store Connect → **Monetization → Pricing and
Availability** → comprobar que el precio es **Free** y editar **Availability**
para añadir territorios → *Save*). La API key no expone ese ajuste, así que no
se puede automatizar el arreglo — pero sí **detectarlo**: `appstore-release.mjs
status` cuenta los territorios y grita si son cero.

La lección se repite: lo que hunde una release iOS no es el código, es un ajuste
de servidor que ningún test del repo puede ver. Primero fue `apple.com` sin
habilitar en Firebase Auth, luego la disponibilidad. Cada uno costó días porque
nada lo miraba. Por eso `status` y `check:store-claims` miran ahora.

**Aceptada no es publicada, y el hueco entre las dos duró horas.** Mientras la
versión no se libera (o mientras propaga), `apps.apple.com` devuelve 404 y
`itunes.apple.com/lookup?id=6804756586` devuelve `resultCount: 0`. Rellenar
`APP_STORES.ios` en ese momento habría mandado a cada visitante de iPhone a una
página inexistente. Por eso `pnpm check:store-claims` comprueba que cada URL de
`APP_STORES` resuelve de verdad, y por eso la página —no el correo— es lo que
autoriza a rellenarla. El mismo criterio vale para Android.

### El rechazo de 1.0.0 — guideline 2.1(a)

Apple rechazó la primera submission el **2 sep 2026** con *"got an error when
trying to login with Apple login"*. La causa no estaba en el cliente: el botón,
el nonce y `signInWithCredential` eran correctos y sus tests unitarios pasaban.
**`apple.com` no estaba habilitado como proveedor en Firebase Auth en ningún
entorno**, así que la llamada moría en `auth/operation-not-allowed` — sólo en
runtime, delante del revisor. `pnpm check:store-claims` ahora comprueba, contra
la infra viva, que cada proveedor que la app ofrece está habilitado en los tres
entornos.

**Queda un fallo sin explicar, en otra capa.** Tras habilitar el proveedor, un
tester de TestFlight seguía sin poder entrar: se abre la hoja de Apple, Face ID
reconoce, y entonces es **el propio iOS** quien dice *«no se ha completado el
registro»* — cadena que no está en `packages/i18n`. Es decir, `signInAsync()`
aborta en la capa nativa y Firebase no llega a llamarse.

Verificado y descartado como causa (3 sep 2026), todo vía la ASC API:

| Comprobación | Resultado |
|---|---|
| Capability `APPLE_ID_AUTH` en el App ID `CMZZ2NW7J9` | habilitada, `PRIMARY_APP_CONSENT` (no agrupada bajo `com.ordago.app`) |
| Perfil de aprovisionamiento (26 ago, `ACTIVE`) | concede `com.apple.developer.applesignin: ["Default"]` |
| Proveedor `apple.com` en los tres entornos | habilitado, `bundleIds: com.cultuvilla.app` |
| Nonce del cliente | correcto: hasheado a Apple, crudo a Firebase |
| Código de auth en el build 9 | idéntico a `develop` (`git diff` vacío) |
| Colisión `auth/account-exists-with-different-credential` | descartada: ocurriría *después* de la hoja de Apple, con error nuestro, no de iOS |

El dato que lo resolvería es el código de `ASAuthorizationError` detrás del
diálogo. Desde `55589f4a` (`reportAuthError`) los fallos de login que no son una
cancelación llegan a Error Reporting con `surface: auth` — mirar ahí antes de
retirar el plan.

## The one decision that set the timeline

Google requires **personal** developer accounts registered after 13 Nov 2023 to
run a **closed test with at least 12 testers, continuously opted in for 14 days**,
before the production track unlocks. **Organization** accounts are exempt but
need a D‑U‑N‑S number (free, ~1–2 weeks to obtain).

**Decidido: cuenta personal.** La vía organización se salta los 12 testers × 14
días pero exige D‑U‑N‑S y una entidad jurídica registrada; la política de
privacidad nombra a una persona física como responsable del tratamiento, así
que personal es lo honesto y lo rápido.

The requirement is **per package name**. It is satisfied for `com.cultuvilla.app`;
the tester app `com.cultuvilla.app.beta` lives on its own **internal** track,
which the rule does not gate — see
[docs/decisions/beta-is-its-own-play-app.md](../../decisions/beta-is-its-own-play-app.md).

## External facts and where each one lands

| Fact | Where you get it | Where it goes |
|---|---|---|
| Play service account JSON | GCP → service account key, then Play Console → Users and permissions → invite `play-publisher@cultuvilla-prod.iam.gserviceaccount.com` with the app permissions below | repo secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |
| App signing key SHA-256 | Play Console → **Protected with Play → Play Store protection → Play app signing** | committed into `web/well-known/{env}/assetlinks.json` |
| App signing key SHA-1 | same screen | **new Android OAuth client** in the `cultuvilla-prod` GCP project |
| Apple Team ID | Apple Developer → Membership | committed into `web/well-known/{env}/apple-app-site-association` **and** `apps/mobile/eas.json` (`submit.production.ios.appleTeamId`) |
| App Store Connect app id | App Store Connect → App Information | repo var `ASC_APP_ID` |
| ASC API Key `.p8` file | App Store Connect → Users and Access → Integrations → App Store Connect API | repo secret `APPLE_ASC_API_KEY_P8` |
| ASC API Key ID | same screen | repo var `APPLE_ASC_KEY_ID` |
| ASC API Key Issuer ID | same screen (above the keys table) | repo var `APPLE_ASC_ISSUER_ID` |

Three access facts that are not obvious from the table:

- **Testing-track and production release are separate Play permissions.**
  Under *Users and permissions → play-publisher@… → App permissions →
  Cultuvilla*, production needs **Release to production, exclude devices, and
  use Play App Signing** on top of **Release apps to testing tracks**. Without
  it the build succeeds and `eas submit` fails with *"The service account is
  missing the necessary permissions"* — the 1.0.0, 1.4.1 and first 1.5.0 runs
  did. Granted 2026-09-29; 1.5.0 (`36545683742`) was the first production
  release to reach Play through CI.

- `cultuvilla-prod` **has no parent organization**, so the org-wide
  `iam.disableServiceAccountKeyCreation` never applied to it; only
  `cultuvilla-beta` is inside org `1005684282225`. Play no longer requires
  linking a Cloud project — the service account is invited like any user from
  *Users and permissions*.
- An Apple **Individual** account gives Certificates/Identifiers/Profiles access
  only to the Account Holder, not delegable by App Store Connect role. The
  signing-credential bootstrap needed one interactive `eas build` from them.

### The Android OAuth client is the easy thing to forget

Play re-signs every AAB with the **app signing key**, so the certificate on a
user's device is not the upload key EAS signed with. Google Sign-In verifies the
caller by `package name + signing SHA-1`. Without an Android OAuth client
registered for `com.cultuvilla.app` + the **app signing** SHA-1 in the
`cultuvilla-prod` project, sign-in fails on every Play-installed build while
working perfectly on every locally-installed one. Registering the SHA-1 in
Firebase creates that client automatically.

The **SHA-256** from the same screen belongs in
`web/well-known/prod/assetlinks.json`, which is already filled
in — that is what makes a shared `https://cultuvilla.es/event/...` link open the
app instead of the browser. `dev` and `beta` still carry placeholders; fill each
one when that build is first distributed.

## Store listing, declarations, assets

Kept in [docs/store/](../../store/) so the same answers serve both consoles and
stay reviewable in git:

- [docs/store/listing-es-ES.md](../../store/listing-es-ES.md) — nombre, descripciones, categoría, keywords.
- [docs/store/play-declarations.md](../../store/play-declarations.md) — todo el checklist de **App content**: privacy policy, app access, ads, content rating, target audience, data safety, government apps, financial features, health.
- [docs/store/app-store-declarations.md](../../store/app-store-declarations.md) — App Privacy labels, age rating, notas de revisión, export compliance.
- [docs/store/assets.md](../../store/assets.md) — icono, feature graphic, capturas.

Reviewers sign in with the fixed-code review account (`_admin/reviewAccess`,
written by `scripts/set-review-access.mjs`), since login is email OTP or
Google/Apple and no loose credential works.

## Repo knobs this runbook feeds

- `apps/mobile/eas.json` — `submit.internal` / `submit.closed` / `submit.production`
  map 1:1 to the Play tracks `internal` / `alpha` / `production`.
- `.github/workflows/mobile-release.yml` — the manual build+submit entry point.
- `.github/workflows/appstore-release.yml` — App Store Connect status / release / submit.
- `packages/shared/src/config/appStores.ts` — the store URLs every download offer derives from.
- `web/well-known/{env}/` — the deep-link association files,
  signing identities committed; copied into place at hosting-deploy time by
  `scripts/build-web-static.mjs`.

## Build gotchas proven the hard way

Both of these cost a failed build on the first-ever EAS run. Neither is
reproducible locally, because locally the missing pieces already exist.

**`packages/shared` must be built on the EAS builder.** Its `exports` resolve to
`./dist/*`, `dist/` is gitignored, and EAS uploads *committed git state* — so the
builder never receives it. Metro has no `src` alias (unlike tsconfig `paths` and the
jest `moduleNameMapper`, which both point at `src`), so the import is simply
unresolvable and the build dies in **Bundle JavaScript** with no useful message.
`eas-build-post-install` in `apps/mobile/package.json` runs `pnpm --filter
@cultuvilla/shared build` on the builder. `@cultuvilla/i18n` needs no equivalent —
its entry is `index.ts` and Metro transpiles it directly.

**Every `FIREBASE_*_<ENV>` var must exist in the EAS environment the profile binds
to.** `app.config.ts` resolves each through `?? ''`, so a missing variable does not
fail the build — it ships an app whose Firebase config is empty strings, which looks
fine until the first launch. The `production` environment initially held only
`FIREBASE_*_DEV`. Check with `eas env:list --environment production` before building,
and note the `production` build profile pins `"environment": "production"` explicitly
rather than relying on eas-cli's default.

## The EAS project is pinned, deliberately

`apps/mobile/app.config.ts` hardcodes `owner: 'cultuvilla.app'` and the literal
`projectId`, rather than reading `EAS_PROJECT_ID` from the environment. An env var is
machine-global, and the same dev machines check out `ordago-apps` (owner
`ordago-apps`); a stray export would silently build one repo into the other's EAS
project. `apps/mobile/__tests__/appConfig.test.ts` fails if the env indirection
returns. The eas-cli login is global and per-*user*, not per-repo — one Expo user
belongs to many accounts, and `owner` is what routes each repo. `EXPO_TOKEN` is a
personal token under `alvaro-francisco-gil`, Admin on the `cultuvilla.app` account.
