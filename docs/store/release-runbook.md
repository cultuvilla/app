# Store release runbook — Google Play and App Store

How Cultuvilla reaches both stores, and the external (console-side) facts that
the code cannot show. Both listings are public: iOS since 2026-09-04, Play since
2026-09-28. The release *flow* itself is in AGENTS.md (*Versioning & releases*)
and [production-auto-release.md](../decisions/production-auto-release.md).

**This doc describes state that lives outside the repo, and that state drifts
silently.** Run `pnpm check:store-claims` before trusting any line of it.
[README.md](README.md) holds the store *content* (listing, declarations,
assets). This file is the *process*.

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
| que una versión nueva vaya a revisión | nada: el merge `beta → main` lo hace (`production-release.yml`); a mano, `submit` sin `build_number` |

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

Sign in with Apple was re-checked on 2026-10-06 against prod Cloud Logging
(`jsonPayload.surface="auth"`). The remaining failures were
`ASAuthorizationError.unknown`, spread across versions and retried, which is
typically a phone not signed into an Apple ID. It is not a defect: a broken
entitlement or Services ID would fail every attempt.

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
[docs/decisions/beta-is-its-own-play-app.md](../decisions/beta-is-its-own-play-app.md).

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

## Repo knobs this runbook feeds

- `apps/mobile/eas.json` — `submit.internal` / `submit.closed` / `submit.production`
  map 1:1 to the Play tracks `internal` / `alpha` / `production`.
- `.github/workflows/production-release.yml` — the automatic production release on a version-bumping merge to `main` (Android build → Play production, iOS TestFlight build → App Review, OTA → `production`). See `docs/decisions/production-auto-release.md`.
- `.github/workflows/mobile-release.yml` — the manual build+submit escape hatch.
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
