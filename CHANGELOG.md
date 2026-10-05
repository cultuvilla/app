# Changelog

All notable changes to this project. Format adapted from [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project ships via PRs with conventional commit messages and uses dated sections rather than semver releases.

## [Unreleased]

- Signing out wipes the app's on-device data cache and restarts the app, so
  member-only data (private events, censo answers) never stays on a shared
  phone after the session ends.
- A quiet "Sin conexión — mostrando datos guardados" pill shows while the
  phone is offline; the app keeps working from what it has saved.
- Event, place, barrio, cartel, history, word, news and group pages update
  live and open instantly on a revisit; a deleted item shows "no encontrado"
  instead of a stale page, and an event that does not exist no longer spins
  forever.
- The village home is live: it paints from the on-device cache at once (offline
  too) and updates as the village changes, instead of reloading every time
  you return to it.
- The app runs the native Firebase SDKs (`@react-native-firebase/*`) instead of
  the JS SDK: Firestore keeps a persistent on-device cache, the groundwork for
  opening offline. Services are unchanged; they reach Firebase through an SDK
  seam in `packages/shared`. Native code: ships in the next store build.
- The app no longer builds for the web: the Expo web export, its web-only
  code paths, `react-native-web` and the Playwright web E2E suite are gone. The
  web is the read site; the Android Maestro suite is the end-to-end gate.
- New server-rendered read site (`readSite` function): every public page of a
  pueblo — events, news, peñas, places, barrios, carteles, history and
  vocabulary — readable without the app, with share previews and structured
  data; every action hands over to the app.
- The web is now the read site: Hosting serves its static files (`web/`) and
  sends every page to `readSite`. The Expo web app is no longer deployed, and
  the share-preview function `ogRenderer` is gone. Account and creation screens
  on the web answer with an "open the app" page.
- The sitemap no longer lists hidden news posts.
- The fiestas Wrapped is now for the whole pueblo, not just its admins. Once
  published it opens as a story (tap to move between cards, hold to pause) at
  `/<pueblo>/fiestas/<año>`, a link that previews in WhatsApp with its cover
  card and opens without an account. Each card can be shared as an image from
  the app, straight to WhatsApp status or Instagram stories, and every card
  now prints its own address. Every village member gets a notification when it
  is published, and the village home shows it for two months afterwards. The
  admin review screen previews it in the same story viewer, and a January
  reminder about December's fiestas now opens last year's Wrapped.

- The iOS and Android apps report the same usage analytics as the web
  (Google Analytics for Firebase), plus an `app.link.opened` event when a
  shared link opens the installed app. Native code: ships in the next store
  build, not over OTA.
- Remove the retired village invite-token flow: the `acceptInvite` callable,
  `inviteTokenService` and the invite-token model. Nothing in the app has used
  them since the admin screen was retired in v0.10.0; the rules now deny the
  collection outright.
- Sign-in emails (code and link) are also rate-limited per caller IP, across
  addresses, on top of the existing per-address limit.
- Tighten `users` read access to the account owner (and app admins). Names and
  active villages of other accounts are now read from a new `publicProfiles/{uid}`
  projection, kept in sync by the `syncPublicProfile` trigger. **Migration:**
  `publicProfiles` is seeded by `scripts/backfill-public-profiles.mjs`
  (pre-deploy, autoApply on every env).
- Bind `users.email` to the verified auth email on account creation (client
  writes and the `acceptInvite` callable), and limit listing a village's invite
  tokens to its admins.
- Census answers move from the village membership doc to a private
  `censoAnswers/{municipalityId}_{uid}` doc, readable by the villager, the
  village's admins and app admins; they are deleted when the membership ends.
  **Migration:** existing answers are moved by
  `scripts/backfill-censo-answers-private.mjs` (pre-deploy, autoApply on
  beta/prod; run it on dev at merge).
- **Grupos con admisión.** Un grupo puede exigir aprobación para unirse: quien
  quiera entrar lo solicita y un administrador lo acepta o rechaza desde la
  página del grupo o el Buzón, con aviso a ambos. Solo los grupos con admisión
  pueden tener eventos privados; si un grupo vuelve a ser abierto, sus eventos
  privados dejan de verse hasta que vuelva a exigir aprobación. **Migration:**
  `organizations.joinPolicy` se rellena con
  `scripts/backfill-org-join-policy.mjs` (pre-deploy, autoApply en beta/prod;
  en dev hay que lanzarlo al fusionar): los grupos con eventos privados pasan a
  `approval`, el resto a `open`.
- Image uploads are checked against the same authority as the content they
  illustrate (village membership, org or village admin, news author), and a
  private persona's photo is readable only by whoever manages it.
- **Embajadores de Cultuvilla.** Quien cuida de un pueblo ya no es su
  «administrador»: es su **Embajador** o **Embajadora de Cultuvilla** (según el
  sexo de su perfil). Hay uno por pueblo y es un título público: aparece con nombre
  y foto en la página del pueblo, como insignia en su perfil y en la lista de
  vecinos, y al recibirlo se muestra una bienvenida con opción de compartirlo. El
  resto de responsables pasan a ser el **Equipo del pueblo**, con los mismos
  permisos. El Embajador puede **ceder el título** a otro vecino desde la lista de
  personas. **Migration:** `community.organizerSex` se rellena con
  `scripts/backfill-community-organizer-sex.mjs` (pre-deploy, autoApply en cada
  entorno).
- The business registry (`project/`), the founders' panel (`apps/panel`), their scripts, research skills and scout agents moved to the private [cultuvilla/business](https://github.com/cultuvilla/business) repo, history included. `getBusinessSnapshot` now serves the snapshot that repo publishes to `_admin/businessSnapshot` instead of a JSON bundled into functions, so the daily-stale `business:snapshot:check` gate is gone from this repo's CI.
- `/descarga` (the printed QR) now sends an iPhone/iPad straight to the App Store and an Android device straight to Google Play, with no picker page in between. Desktop still sees the picker.

## v1.5.0 — 2026-09-29

<!-- store-notes -->
- **Cultuvilla ya está en Google Play**: la web ofrece la descarga también para Android.
- Correcciones y mejoras.
<!-- /store-notes -->

### Changed

- **Cultuvilla está en Google Play.** La web ofrece ahora la descarga para
  Android (banner y `/descarga`) igual que para iPhone, y el aviso de «hay una
  actualización» también llega a Android.
- **Beta en Android es su propia app, «Cultuvilla Beta».** Se instala junto a
  la app de la tienda (contra los datos de beta) en vez de sustituirla, así que
  los testers vuelven a ver la Cultuvilla pública en Google Play. Las
  actualizaciones OTA llevan ya la configuración de Firebase de su entorno.

## v1.4.1 — 2026-09-27

<!-- store-notes -->
- **Cerrar sesión vuelve a funcionar** en iPhone y Android.
- Correcciones y mejoras.
<!-- /store-notes -->

### Fixed

- **Signing out works again on iOS and Android.** Since 1.4.0 the app deleted
  this phone's push-token row before signing out, and waited for Firestore to
  confirm it. On a phone whose Firestore connection had stalled that
  confirmation never came, so "Cerrar sesión" did nothing. The cleanup is still
  attempted first, but sign-out now waits at most three seconds for it (and for
  the Google SDK sign-out) before signing out regardless; a row left behind is
  pruned when the platform reports its token dead. Web never waited on it — it
  registers no push token.

### Changed

- **Every beta merge reaches TestFlight testers, internal and external.** The
  iOS build a `beta` merge makes is added to every TestFlight group and
  submitted for Beta App Review, with the version's store notes as "What to
  Test"; before, it reached only the automatic internal group, and not at all
  while the Play freeze had the workflow disabled. The Play freeze is now the
  repo variable `PLAY_SUBMIT_PAUSED`, which skips only the Android job. iOS
  production submits the build testers already ran instead of rebuilding it.

## v1.4.0 — 2026-09-24

<!-- store-notes -->
- **Diccionario del pueblo por pestañas:** Palabras, Dichos, Motes y Topónimos, con las caras de quienes han aportado cada palabra.
- **Palabra del día más sencilla** y las palabras nuevas empiezan siempre con mayúscula.
- **Inicio de sesión más claro:** «Entrar» en vez de «Registrarse», y avisamos si el correo está mal escrito.
- Correcciones y mejoras.
<!-- /store-notes -->

### Added

- **`project/busquedas/` — the searches, not just the findings.** Every record in
  `convocatorias/`, `eventos/` and `entidades/` is something a search *found*; none
  of them is evidence of the searches that found **nothing**. So each sweep of the
  registry now files one record carrying its sources, its scope, its review date
  and — required by validation — `sinHallazgos`, the funders and portals that
  returned nothing and why. That last field is the whole point: without it the next
  sweep re-searches ENISA and Red.es and reaches the same conclusion, which is how
  a recurring agent ends up repeating itself instead of compounding. Filed the
  September 2026 convocatorias sweep as the first record, including the five lines
  ruled out on eligibility grounds.
- **An overdue sweep opens an issue.** `pnpm opportunities:verify` warns once a
  búsqueda's `revisar` date passes and names the skill to run; `--strict` exits 1
  and runs weekly from `busquedas-freshness.yml`. Deliberately **not** part of
  `pnpm check` — a review date passes on a calendar boundary rather than on a diff,
  so gating PRs would red `develop` for something nobody in that PR did. Same
  posture as `fiestas:verify`.
- **The panel shows coverage, not only opportunities.** The Registro tab has a
  *Búsquedas* section listing what has been swept, what it ruled out and when it is
  due again, and a sweep's review date appears on the calendar alongside deadlines.

### Changed

- **"Añadir otro significado" is a floating button.** On a word's screen it now
  floats at the bottom like "Añadir palabra" on the list, instead of sitting
  under the last meaning. In the dictionary list the contributors' faces moved
  to the far right of each row, replacing the arrow.
- **Dictionary rows credit everyone who worked on a word.** The faces now sit
  right after the word and include the groups credited (their icon first) and
  every villager who added a meaning, not only whoever recorded the word first.
- **The dictionary's search scrolls away, and rows show who added each word.**
  The search box ("Busca en el diccionario") now sits under the kind tabs as
  the first row of the list, fading out as you scroll down instead of always
  taking space; the tabs stay put while you type. Each word's row ends with the
  faces of the villagers who digitalized it (up to three, then "+N").
- **The village dictionary has a tab per kind.** "Diccionario de X" now has
  tabs along the top — Palabras, Dichos, Motes, Topónimos — showing only the
  kinds the village has recorded (no tabs at all when there is just one). The
  search box still looks through every kind. Each row shows only the word,
  without the kind and meaning count underneath.
- **Horizon Europe CL2 and Town Twinning CERV are `expired`.** Both lapsed on
  2026-09-23 with nothing submitted. Kept rather than deleted: Town Twinning's
  blocker was never the date but the applicant (the ayuntamiento), and that is the
  work the next edition needs.

- **The word of the day and the word screen are simpler.** The village card
  names the kind in its heading ("Dicho del día", "Mote del día"…) instead of a
  separate badge, and no longer lists other words under it. On the word screen
  the headword is centred with its kind as a badge above it, the meanings are
  headed just "Significados", and each meaning shows its date and who added it
  without the "Digitalizado por" label.
- **New vocabulary words always start with a capital letter.** "tenao" is saved
  as "Tenao", so the alphabetical list no longer mixes both styles. A dicho keeps
  its opening "¡" or "¿" ("¡Anda ya!"), and the rest of the word is kept as
  typed. Existing words in prod were already fixed by hand.
- **The guest sheet says "Entrar", not "Registrarse".** Signing in and signing
  up are one email-code flow, so a returning user reading "Registrarse" thought
  they were in the wrong place. The button now reads "Entrar", with a line
  underneath saying an account is created if you don't have one, and the reason
  copy follows ("Entra para ver tu pueblo.").
- **A malformed email is flagged before anything is sent.** The login screen
  warns under the field on submit or on leaving it, and change-email does the
  same on submit. The check is `isValidEmail` in `@cultuvilla/shared/utils`,
  now also used by the three auth callables in place of their own copies.
- **Las fiestas de los pueblos pasan a ser un registro, no una foto.** La
  investigación de `project/mercado/` se rehacía entera cada año porque no
  guardaba nada de lo aprendido. Ahora cada fecha lleva `fuente` (una URL o una
  cita que se puede reabrir) y `verificadoEl`; `cobertura` registra hasta dónde
  llegó cada barrido — sin eso una búsqueda de 20 km y una de 300 km producen
  ficheros idénticos —; y los 45 pueblos sin semana confirmada llevan un
  `[[confirmar]]`, así que los huecos salen en un grep en vez de ser invisibles.
  **Migration:** `project/mercado/pueblos-vecinos-matabuena.json` cambia de forma
  (`fuente` pasa de categoría a cita, entra `tipo`); es un fichero del repo, no
  datos en Firestore, así que no hay backfill que ejecutar.

### Fixed

- **Una fecha móvil ya no se congela.** El boletín imprime igual «San Miguel, 29
  de septiembre» (fijo para siempre) que «Virgen del Rosario, 5 de octubre»
  (el primer domingo de octubre, trasladado al lunes). Guardar las dos como
  mes-día dejaba el calendario silenciosamente mal a partir de 2027. Ahora una
  fiesta móvil lleva su regla (`primer domingo de octubre` → `{n:1, weekday:7,
  month:10}`) y se recalcula cada año; las que no sabemos si son fijas o
  trasladadas se marcan `[[confirmar]]` en vez de adivinarlas.

### Added

- **`pnpm fiestas:verify`** informa de cobertura, porcentaje verificado y
  marcadores abiertos. No entra en `pnpm check`: la caducidad salta por
  calendario, no por un diff, y tumbar cada PR de octubre pondría `develop` en
  rojo por algo que nadie hizo en ese PR. La avisa
  [fiestas-freshness.yml](.github/workflows/fiestas-freshness.yml), que abre una
  issue el día 1 de cada mes cuando el BOP del año siguiente ya debería estar.
- **Skill `research-village-fiestas` + agente `mercado-scout`**, con cadencia
  event-driven (BOP de Segovia ~finales de septiembre, BOCM de Madrid ~mediados
  de diciembre) en vez de semanal: los boletines salen una vez al año y un
  barrido que no encuentra nada cincuenta veces enseña a ignorarlo.

### Fixed

- **The "hay una actualización" modal pointed at a version that did not exist.**
  `config/appVersion.latest` was derived from `apps/mobile/app.config.ts`, which
  is the version a promotion deploys to the backend and the web — not the
  version any store serves. Store binaries move only by an explicit
  `mobile-release` dispatch and then wait for review, so the two drift by
  design, and prod ended up announcing `1.3.0` while the App Store served
  `1.2.2`: every iOS user already on the newest build available got the soft
  update prompt every three days, and tapping it opened a store page that did
  not have it. Android would have inherited the same the day Play approved.
  `latest` is now per-platform and read from the new `APP_STORE_VERSIONS` in
  [appStores.ts](apps/mobile/lib/appStores.ts) — the same single source as the
  store URLs — with a platform that has nothing published announced as `0.0.0`,
  which nobody is ever behind. `pnpm check:store-claims` now fails when the
  declared iOS version and the live App Store disagree, and `minSupported` above
  what a store serves is refused outright rather than walling the fleet with
  nowhere to go. **No data migration:** prod and beta carry the stale `1.3.0`
  (and the `id000000000` storeUrl fixed in `2ca83ec3`) until the next promotion
  rewrites the doc.

- **The panel deploy never actually deployed.** `deploy-panel.yml` deploys the
  `getBusinessSnapshot` callable, but never installed `functions/`'s own
  dependencies — and `firebase deploy --only functions:<one>` runs an esbuild
  predeploy over the whole functions codebase, not just the named function. It
  died resolving `resend` and `satori`, so every panel deploy failed at that
  step and the live panel kept serving the previous snapshot. Locked by
  [functionsDeployDeps.test.ts](packages/shared/test/ci/functionsDeployDeps.test.ts).

### Added

- **Panel: tabs, and a Fiestas tab.** The founders' panel is now `Registro` ·
  `Propuestas` · `Fiestas` (the tab lives in the URL hash). Proposals get their
  own tab together with the "marcadas listas pero con huecos" alert; `Con reloj`
  stays in `Registro` and still spans every kind. The new Fiestas tab lists the
  next fiestas of the 48 pueblos within 20 km of Matabuena, soonest first, plus
  the full list grouped by distance ring. Every date is tagged `BOP` or
  `verificada`, because a municipality's two declared *fiestas locales* are its
  liturgical anchor and not the week it actually celebrates — Matabuena declares
  16 and 25 July and holds four fiesta windows, the biggest 22–28 August. Data
  lives in `project/mercado/pueblos-vecinos-matabuena.json`, validated against
  `FiestasDatasetSchema` and carried through the existing `getBusinessSnapshot`
  callable, so nothing new is shipped to a browser that has not proved it may
  see it.

### Fixed

- **El Buzón ya no se puede quedar atascado.** Un aviso que la app no sabía leer
  —porque su `type` es más nuevo que la versión instalada— tiraba abajo toda la
  lista y dejaba en pantalla el error en crudo: un bloque de JSON tan largo que
  empujaba el botón de cerrar fuera de la pantalla. En iOS no hay gesto para
  cerrar un `Modal` ni botón atrás, así que la única salida era forzar el cierre
  de la app. Ahora la lista se salta el aviso ilegible (y nos lo reporta) en vez
  de caerse entera, y el diálogo de error vive en un `ErrorDialog` con el cuerpo
  desplazable y cinco formas de salir.
- **El aviso de «actualiza la app» llevaba a una página muerta en iOS.** El
  `storeUrl.ios` de `config/appVersion` seguía siendo el marcador de posición
  `id000000000`; ahora se lee de `apps/mobile/lib/appStores.ts`, la única fuente
  de verdad, y escribir una URL vacía falla en vez de pasar desapercibido.

### Changed

- **El resumen de las fiestas empieza por lo que se hizo:** la tarjeta «Lo que se hizo» pasa delante de «En números», así los números llegan como remate de lo que ya has visto y no como presentación de lo que viene. Los resúmenes ya creados se reordenan solos — el orden se aplica al mostrarlos, así que no hay que volver a generarlos.

## v1.3.0 — 2026-09-20

<!-- store-notes -->
- **Intro al abrir la app:** una animación con el logo mientras la app carga.
- **Diccionario de tu pueblo:** la sección de palabras lleva ahora el nombre del pueblo.
- **Fotos que faltaban** en el resumen de las fiestas y en los carteles ya aparecen.
- Correcciones y mejoras.
<!-- /store-notes -->

### Added

- **Intro al abrir la app (iOS y Android):** una animación de 4 s con el logo y su sonido, sobre el mismo crema de la app, mientras la app carga por debajo; se funde con la portada en cuanto las dos cosas han terminado, y un toque la salta. No aparece en la web (quien llega por un enlace va directo al contenido) ni con «Reducir movimiento» activado, y el sonido respeta el modo silencio. Necesita un binario nuevo: `lottie-react-native` y `expo-audio` son módulos nativos, así que no llega por OTA a las instalaciones actuales. El archivo se regenera desde la exportación del animador con `scripts/prepare-intro-lottie.mjs`.

### Changed

- **«Vocabulario» pasa a llamarse «Diccionario de <pueblo>»:** la sección de palabras del pueblo lleva ahora el nombre del pueblo en su título — «Diccionario de Matabuena» — en la portada, en el listado A–Z y en la ficha de cada palabra. La dirección sigue siendo `/<pueblo>/vocabulario`, así que los enlaces compartidos siguen funcionando.

### Fixed

- **Fotos que faltaban en el resumen de las fiestas y en los carteles:** algunas fotos se quedaban fuera sin motivo aparente, y cambiaban de una vez a otra. La descarga de una foto fallaba de vez en cuando por un corte momentáneo de red y se daba por perdida al primer intento, sin dejar rastro en ningún registro. Ahora se reintenta, y si aun así no se consigue queda anotado con el motivo.
- **Enlaces en las fuentes de un acontecimiento:** una dirección web citada en «Fuentes» ya se puede pulsar para abrirla, igual que en el relato. Antes se quedaba como texto muerto.
- **El resumen de las fiestas ya abre en un pueblo que aún no lo ha creado:** la pantalla se quedaba cargando para siempre. Al preguntar si ya existe el resumen del año, las reglas denegaban la lectura de un documento que no existe en lugar de responder «no hay ninguno», y la pantalla se quedaba esperando una respuesta que no llegaba nunca. Además, quien no ha iniciado sesión ya no se queda en la rueda de carga: se le lleva al pueblo como corresponde. Si la lectura falla por cualquier otro motivo, la pantalla lo dice y ofrece reintentar.

## v1.2.2 — 2026-09-15

<!-- store-notes -->
- **Registro arreglado:** ya puedes registrarte desde un evento, un pueblo o un comentario sin llegar a una pantalla de error.
<!-- /store-notes -->

### Fixed

- **Registro desde una acción de invitado:** pulsar «Regístrate» en la hoja de registro (inscribirse a un evento, unirse a un pueblo, comentar…) ya no abre una pantalla «Unmatched route».

## v1.2.1 — 2026-09-14

<!-- store-notes -->
- **El resumen de las fiestas:** los administradores crean el resumen del año, listo para compartir por WhatsApp.
- **Historia y palabra del día** en la portada de cada pueblo.
- **Una palabra, muchos pueblos:** mira en qué otros pueblos se dice la misma palabra.
- **Títulos y subtítulos** en los artículos, y hasta 25 fotos por artículo.
- **Direcciones en español** con el nombre del pueblo: cultuvilla.es/tupueblo.
- Correcciones y mejoras.
<!-- /store-notes -->

### Fixed

- **La app de iOS vuelve a compilar con notificaciones.** El identificador de la
  app en Apple no tenía la capacidad de notificaciones push, y el primer build de
  1.2.0 fallaba al firmar. Se ha activado y regenerado el perfil. Los avisos
  urgentes («se libera una plaza») llegan en iOS como avisos normales hasta que
  se active también *Time Sensitive Notifications* en el portal de Apple.

## v1.2.0 — 2026-09-14

<!-- store-notes -->
- **El resumen de las fiestas:** los administradores crean el resumen del año, listo para compartir por WhatsApp.
- **Historia y palabra del día** en la portada de cada pueblo.
- **Una palabra, muchos pueblos:** mira en qué otros pueblos se dice la misma palabra.
- **Títulos y subtítulos** en los artículos, y hasta 25 fotos por artículo.
- **Direcciones en español** con el nombre del pueblo: cultuvilla.es/tupueblo.
- Correcciones y mejoras.
<!-- /store-notes -->

### Fixed

- **Pestañas «Mi pueblo» y «Perfil».** Volvían a salir sin icono y en orden cambiado tras el paso a URLs en español; recuperan su icono y su sitio.

### Changed

- **Explora abre en Artículos.** El selector muestra «Artículos» antes que «Eventos».

### Added

- **Historia y palabra del día en la portada del pueblo.** Los botones «Historia»
  y «Vocabulario» se sustituyen por dos piezas visuales: una línea del tiempo
  horizontal con el año de cada acontecimiento y su foto (o el comienzo del relato),
  y una tarjeta con la palabra del día, su significado, un ejemplo y otras palabras
  para seguir leyendo. La palabra cambia cada día y es la misma para todos.
- **Palabras y acontecimientos desde «Añadir contenido».** La hoja de añadir
  contenido del pueblo ofrece ahora «Palabra» (vocabulario) y «Acontecimiento»
  (línea de historia), que abren directamente sus pantallas de creación.
- **Hasta 25 fotos por noticia.** El límite de imágenes dentro del cuerpo de una
  noticia sube de 10 a 25: una crónica de fiestas o una galería de una jornada ya
  no obliga a elegir. El coste de almacenamiento es marginal, porque cada foto se
  reduce a 1600 px antes de subirla y los lectores descargan la versión de
  tarjeta, de unos 150 KB.
- **Títulos y subtítulos en los artículos.** Selecciona una palabra de una
  línea y pulsa **Título** o **Subtítulo** en la barra de formato (junto a
  negrita y cursiva): esa línea pasa a ser un título, para ordenar textos largos
  (el programa de fiestas, una crónica por días). Con **Texto** vuelve a ser una
  línea normal. En el ordenador, un triple clic selecciona todo el texto del
  bloque para darle formato de una vez. Las versiones anteriores de la app
  muestran los títulos como un párrafo normal.

- **Una palabra, muchos pueblos.** Las palabras empiezan a repetirse entre
  pueblos, y eso deja de ser un problema de duplicados para convertirse en lo
  interesante: mientras escribes una palabra nueva, el formulario te muestra si
  ya está recogida en otros sitios («esbardo · en 3 pueblos»). La eliges, te
  quedas con su grafía, y la añades al tuyo aportando **tu** significado. En la
  pantalla de la palabra aparece **«También se dice en»**, con los demás pueblos
  y cuántas acepciones tiene cada uno: la misma palabra y cómo cambia de un
  pueblo a otro.

  Los duplicados no los evita el buscador, los evita el identificador: se deriva
  de la propia palabra, así que escribirla entera sin mirar las sugerencias
  también acaba en la misma palabra. El buscador sirve para enterarte antes de
  escribir, no para que el sistema funcione.

  **Los motes y los topónimos nunca se comparten**, a propósito. Un mote nombra
  a una familia de un pueblo y un topónimo a un paraje suyo: «El Cerro» de dos
  pueblos son dos sitios distintos, y juntarlos sería un error, no una limpieza.
- **El resumen de las fiestas.** Un administrador del pueblo crea desde
  *Editar pueblo → Resumen de fiestas* el **resumen del año**: siete imágenes
  verticales, para compartir tal cual por WhatsApp — la portada, las cifras
  (con la media de personas por evento), todos los eventos con su cartel, los
  artículos, el pueblo entero en burbujas, todos los que organizaron algo, y los
  carteles de este año sumados al archivo histórico.

  **Un solo resumen por año, con todas sus fiestas**: Santiago en julio y el
  Carmen en agosto van juntos, y la portada nombra cada una con sus fechas. Al
  crearlo se eligen en un calendario **los días de cada fiesta** de ese año y el
  **periodo del resumen**: de él salen los eventos, las inscripciones y los
  artículos. Por defecto va de la primera fiesta a la última, y se puede ampliar
  — por ejemplo, para incluir lo que se escribió la semana antes. Una fiesta que
  este año no se celebró se deja fuera con un interruptor.

  En los créditos cuenta **cada organizador de cada evento** — todas las
  asociaciones y todas las personas del equipo, no solo quien lo dio de alta —
  con su foto de perfil si su persona es pública. Un año sin artículos no
  lleva esa imagen, en vez de una vacía.

  El mes siguiente a las últimas fiestas del año, los administradores reciben
  **un aviso** para crearlo. Tras generarlo lo ven como borrador y pueden
  **publicarlo** o **descartarlo**; si nadie hace nada se publica solo a los
  **tres días**, salvo que tenga poca actividad (menos de tres eventos, o
  ninguna inscripción): entonces decide una persona. Se puede regenerar con
  otras fechas — si ya estaba publicado sigue publicado con las imágenes nuevas.
  Un resumen publicado se abre sin estar registrado, para que el enlace siga
  funcionando en manos de quien lo reciba.
- **Direcciones en español, con el nombre del pueblo.** Cada pueblo tiene su
  propia dirección, `cultuvilla.es/matabuena`, fácil de dictar o de imprimir en
  un bando, y todo lo que publica cuelga de ella:
  `cultuvilla.es/matabuena/evento/fiestas-de-san-roque_…`, `/noticia/…`,
  `/entidad/…`, `/lugar/…`, `/barrio/…`, `/cartel/…`, `/acontecimiento/…`,
  `/palabra/…`. Las pantallas de la app también hablan español (`/ajustes`,
  `/buzon`, `/perfil`, `/crear/evento`…). Un enlace con el título ya cambiado,
  o con otro pueblo, redirige al bueno; y un evento privado nunca muestra su
  título en la dirección. Los nombres que comparten varios pueblos llevan la
  provincia (`moya-cuenca`). Las antiguas direcciones (`/event/…`,
  `/village/…`, `/o/…`) dejan de funcionar; `/legal/privacy` y `/legal/terms`
  redirigen a `/legal/privacidad` y `/legal/terminos` porque las fichas de las
  tiendas apuntan a ellas.
  **Migration:** `scripts/backfill-municipality-slug.mjs` asigna
  `municipalities.slug` y después `scripts/backfill-village-slug-denorm.mjs`
  copia `villageSlug` a `events`, `news`, `organizations`, `festivalPosters` e
  `historyEntries` (per env; ambos `pre-deploy` y `autoApply`, ya aplicados en
  dev).

- **La historia del pueblo, en una línea del tiempo.** Cada pueblo tiene ahora
  un botón **Historia** que abre su cronología: el presente arriba y, según se
  baja, más atrás en el tiempo, con un separador al empezar cada siglo. Cada
  acontecimiento lleva un título, un relato con formato, hasta **tres imágenes
  con pie de foto** (la primera es la portada) y, si se quiere, sus **fuentes**.

  La fecha es tan precisa como lo que se sabe: un año, un mes o un día; un
  momento o un periodo («1936 – 1939»); y puede marcarse como aproximada
  («h. 1500»). Admite años **antes de Cristo** («218 a. C.»), que es donde
  empiezan muchas historias de pueblo — por eso las fechas se guardan como
  números y no como `Timestamp`, que no llega más atrás del año 1.

  Igual que el vocabulario: cualquier vecino publica al instante, cualquiera lo
  lee (también fuera de la app, con enlace para compartir), y los
  administradores ocultan o corrigen después. Los acontecimientos admiten
  comentarios.

  Nueva colección `historyEntries/`: necesita desplegar reglas, índice y
  `storage.rules`. Sin migración — la colección es nueva.
- **Quién digitalizó cada palabra.** Al añadir una palabra al Vocabulario —o un
  significado nuevo a una que ya existe— ahora se puede nombrar a los vecinos y
  grupos que ayudaron a recogerla, igual que en los carteles y los lugares:
  «Digitalizado por Ana, Luis · Peña El Botijo». El formulario pasa a tener dos
  pasos, como el de añadir un lugar: primero la palabra, luego la digitalización.

  **Se acredita la palabra, no sólo el significado**, a propósito: recoger una
  palabra que nadie había escrito es justo la aportación que queremos premiar.
  El crédito de la palabra es de quien la registró primero y no cambia; quien
  añade después otro significado recibe el crédito en *ese* significado.

  Es crédito, no autoría: aparecer nombrado no da permiso para editar. El autor
  va siempre incluido y no puede quitarse, y las reglas limitan cada lista a 20
  personas y 20 grupos para que no sirva para nombrar a medio pueblo.

- **Los pueblos de Cultuvilla ya se pueden encontrar en Google.** La web era una
  aplicación que se pintaba entera en el navegador: quien llegaba a
  `cultuvilla.es/event/…` —o el robot de Google— recibía una página vacía hasta
  que arrancaba la app y respondía la base de datos. Google no tenía nada que
  leer ni ninguna lista de páginas que visitar, así que ningún pueblo aparecía.

  Ahora cada enlace compartido de evento, noticia, pueblo u organización llega
  **con su contenido ya escrito** —título, foto, fecha, lugar y descripción— y la
  app lo sustituye en cuanto tiene sus datos. Es el mismo HTML para personas y
  para buscadores: no hay una versión "para Google". Quien abre el enlace desde
  un grupo de WhatsApp con mala cobertura ve la fiesta al instante en vez de una
  pantalla en blanco.

  Además: un **`/sitemap.xml`** vivo con los pueblos activos, los eventos
  públicos, las noticias y las organizaciones; **datos estructurados**
  (schema.org `Event`, `City`, `Organization`, `NewsArticle`) para que un evento
  salga con su fecha y su lugar en los resultados; una URL canónica sin los
  parámetros de rastreo que añaden WhatsApp o Instagram; y un título y una
  descripción por defecto para el resto de la web, que hasta ahora no tenía
  ninguno.

  Lo que **no** se indexa, a propósito: las fichas de **personas** (un vecino
  aceptó ser visible dentro de la app de su pueblo, no que su nombre salga en
  Google), los **enlaces de invitación** `/join`, los **eventos privados** y las
  pantallas personales (`/me`, `/inbox`, `/settings`, `/admin`).
- **Notificaciones en el móvil.** Hasta ahora las notificaciones sólo vivían en
  el Buzón; ahora llegan también al móvil, en iOS y Android, y **todo lo que se
  añade a un pueblo avisa a sus vecinos**: un evento, una noticia, un lugar, un
  barrio, una peña, un cartel de fiestas o una entrada de la historia del
  pueblo. Además, el día antes de un evento al
  que vas te llega un recordatorio.

  El permiso **no se pide al abrir la app**. iOS sólo deja preguntarlo una vez en
  la vida de la instalación, así que primero sale una hoja propia, en el momento
  en que el aviso tiene sentido —justo después de apuntarte a un evento («¿Te
  avisamos si cambia algo?») o de unirte a un pueblo— y sólo si dices que sí
  aparece el diálogo del sistema. Como mucho dos veces, nunca dos en la misma
  semana.

  En **Ajustes → Notificaciones** eliges qué te llega (*Mis inscripciones*,
  *Novedades del pueblo*, *Actividad y solicitudes*) y si quieres **no molestar
  de noche**: lo que llegue entre las 22:00 y las 8:00 te llega por la mañana,
  salvo lo de tus propias plazas, que llega siempre. En el Buzón sigues viendo
  todo, y ahora cada aviso se puede tocar para ir a lo que anuncia.

  Sólo en la app; la web no pide ni bloquea nada. Requiere una versión nueva de
  la app (no llega por OTA) y, antes del despliegue, el secreto `APNS_AUTH_KEY`
  en cada entorno — ver
  [device-notifications.md](docs/plans/ongoing/device-notifications.md).

- **El vocabulario del pueblo, escrito entre todos.** Cada pueblo tiene ahora un
  **Vocabulario**: las palabras, dichos, motes y topónimos que sólo se dicen ahí
  y que hoy no están escritos en ningún sitio. Cualquier vecino del pueblo añade
  una palabra; cualquiera —también quien no vive allí— la lee, igual que el resto
  del feed abierto.

  Lo que lo hace realmente colaborativo no es que todos puedan publicar, sino que
  **una palabra es un objeto compartido, no un post**. El id del término se
  *deriva* de la propia palabra (`{municipalityId}__{slug}`, tildes y mayúsculas
  plegadas), así que si Ana añade «esbardo» y Luis añade «Esbardo» un minuto
  después, no salen dos entradas: sale una, con dos acepciones. Nadie
  sobrescribe el significado de nadie —cada vecino añade el suyo al lado, con su
  ejemplo de uso y, si la hay, la palabra equivalente en castellano— porque una
  palabra puede querer decir dos cosas en dos barrios y las dos merecen quedarse.

  Sin cola de aprobación, deliberadamente: una lista que hay que aprobar es una
  lista que no se llena. Se publica al instante y los administradores del pueblo
  ocultan o borran después, con la misma palanca (`setContentVisibility`) que el
  resto del contenido. Las palabras admiten **comentarios** y se pueden reportar.

  Un término sólo desaparece cuando se queda sin significados: `definitionCount`
  lo lleva un trigger y las reglas lo leen para permitir —o no— que su autor lo
  retire.
- **Un pueblo ya puede declarar sus fiestas — y pueden ser varias.**
  Matabuena tiene dos: Santiago en julio y el Carmen en agosto, con semanas
  normales por medio. Así que las fiestas son una lista en la ficha del pueblo
  (`community.fiestas`), editable por los administradores desde *Editar pueblo*.

  Cada fiesta es **solo un nombre y un mes**. Los días exactos cambian de un año
  a otro y nadie mantiene un calendario al día, así que no se guardan aquí: se
  eligen cada año al crear el resumen de fiestas, y quedan guardados en ese
  resumen.

  **Migration:** `scripts/backfill-village-fiestas.mjs` (registrado, `pre-deploy`,
  auto-aplicado por el deploy) siembra `community.fiestas: []` en los pueblos con
  comunidad activa, y `scripts/backfill-village-fiestas-month.mjs` (registrado,
  `pre-deploy`, auto-aplicado, después del anterior) reduce cada fiesta ya
  guardada a `{ id, name, month }`. Sin ellos el converter estricto no puede leer
  la ficha del pueblo.

### Fixed

- **El enlace a un pueblo conserva su dirección en la web.** Abrir
  `cultuvilla.es/<pueblo>` desde WhatsApp o desde Google ya no cambia la barra de
  direcciones a `/mi-pueblo?villageId=…`: la ficha se muestra en su propia URL, y
  el botón de volver lleva a la pestaña del pueblo. Un pueblo o una ficha que no
  existen responden ahora con un 404 (y `noindex`) en lugar de una página vacía
  que Google podía indexar.
- **Los enlaces nuevos no abren la app de iOS publicada en una pantalla vacía.**
  La versión 1.0.0 de la App Store no conoce las nuevas direcciones por pueblo y
  no puede actualizarse sin pasar por la tienda. Hasta que haya una versión de
  iOS que sí las conozca, en producción esos enlaces se abren en la web (que
  funciona siempre), y los enlaces antiguos siguen abriendo la app.
- **Las fotos que quitas ya no se quedan ocupando espacio.** Al borrar una
  noticia, un evento, una entidad, un lugar, un barrio, un cartel o una entrada
  de historia —o al quitar o cambiar una de sus fotos al editar— la imagen se
  borra del almacenamiento junto con sus versiones reducidas. Antes se quedaban
  para siempre: el móvil intentaba borrarlas, pero las reglas de Storage lo
  rechazaban en silencio. En carteles e historia, además, el borrado ocurría
  antes de guardar, así que cancelar la edición podía dejar la ficha apuntando a
  una foto ya borrada. Ahora lo hace el servidor, después de guardar, y solo con
  fotos subidas para esa misma ficha.
- **Editar un artículo ya no salta de paso al seleccionar texto.** Los
  formularios por pasos ya no cambian de paso deslizando: se avanza con los
  botones o los puntos. Al arrastrar para seleccionar texto (sobre todo con el
  ratón) se saltaba al paso siguiente.
- **La negrita y la cursiva ya no se ven dobles al escribir en la app.** El
  texto con formato aparecía como dos copias superpuestas en iOS y Android.

- **En el iPhone, Safari no ofrecía la app — y la web se declaraba en inglés.**
  La v1.1.0 anunció que Safari mostraría su propia barra de descarga del App
  Store, y por eso nuestro aviso se aparta en Safari. Pero la etiqueta que la
  enciende vivía en `app/+html.tsx`, un archivo que la web **no usa**: en el
  modo de página única, Expo construye el documento desde
  `public/index.html` e ignora `+html.tsx` por completo. Así que en producción
  la etiqueta nunca salió, y a un visitante de Safari en iPhone no se le
  ofrecía **nada**. Por el mismo motivo la página iba en `lang="en"` desde
  julio pese a un arreglo que decía lo contrario, y Chrome seguía ofreciendo
  traducir una web en castellano. La cabecera vive ahora en
  `public/index.html`, `+html.tsx` desaparece, y el despliegue **se rechaza**
  si la página exportada pierde `lang="es"` o la etiqueta del App Store —
  para que esto no pueda volver a romperse sin que nadie lo vea.
- **Los entornos de pruebas ya no se pueden indexar.** La web de desarrollo y la
  de beta —llenas de datos de demostración con el nombre de Cultuvilla— servían
  un `robots.txt` que invitaba a Google a entrar. Ahora sólo producción se deja
  indexar; dev y beta responden `Disallow: /`. El `robots.txt` es un archivo
  estático por entorno: servirlo desde una función era imposible, porque el
  framework de Cloud Functions contesta `/robots.txt` él mismo con un 404 vacío
  antes de que el código llegue a ejecutarse.
- **Una sola dirección para cada página.** Producción responde en
  `cultuvilla.es` y en `cultuvilla-prod.web.app`, y cada una se anunciaba como
  la dirección canónica, así que Google veía dos copias de todo compitiendo
  entre sí. Ahora la canónica y el sitemap nombran siempre `cultuvilla.es` — y
  también los enlaces de los correos de inscripción y cancelación, que hasta
  ahora mandaban a los vecinos a `cultuvilla-prod.web.app`.
- **Abrir un enlace compartido ya no descoloca la pantalla.** El contenido que
  la web pinta antes de que arranque la app empujaba la app hacia abajo y
  cortaba su parte inferior —barra de pestañas incluida— mientras estaba
  visible. Ahora cubre la pantalla y la app carga debajo, así que al quitarse
  aparece la pantalla ya terminada.

- **Los botones de acción vuelven a verse como botones.** En Pueblo («Añadir
  contenido», «Compartir pueblo», «Unirme», «Rellenar censo») y en Perfil, los
  botones aparecían como texto suelto, sin el contorno terracota, en la app y en
  la web. `ActionPill` pasaba su estilo como función (`style={({ pressed }) =>
  …}`) junto a un `className`, y NativeWind aplica el estilo en línea con
  `{ ...style }`: una función se expande a nada, así que se perdían borde,
  relleno y ancho. El estilo es ahora un objeto y la atenuación al pulsar va por
  la variante `active:opacity-70`. El `Pressable` base tenía el mismo defecto (la
  atenuación al pulsar nunca se aplicaba) y queda arreglado igual; un test impide
  volver a combinar un estilo-función con `className`.
- **El icono de Android ya no toca los bordes.** Android recorta el icono
  adaptativo con la máscara del lanzador (un círculo en Pixel y muchos otros) y
  solo garantiza visible el círculo central de 66 dp de los 108 dp del lienzo.
  El logo de `adaptive-icon.png` se salía de esa zona segura y las puntas de las
  hojas quedaban cortadas o pegadas al borde. El logo se ha reducido al 80 % y
  centrado, con margen dentro de la zona segura. Es un recurso nativo: llega con
  el próximo binario, no por OTA.

## v1.1.0 — 2026-09-04

### Added

- **La release de iOS ya no depende de que alguien pulse un botón.**
  `eas submit` termina en la subida: el binario queda en App Store Connect y ahí
  se para. Todo lo que viene después —crear la versión, adjuntarle el build,
  escribir las novedades, mandarla a revisión y publicarla— era trabajo manual
  contra la API de ASC, y por eso **1.0.0 estuvo dos días aprobada y sin
  publicar** sin que nada lo vigilara.

  Ahora `scripts/appstore-release.mjs` hace las cuatro cosas (`status`,
  `submit`, `release`, `phased`) y `mobile-release.yml` encadena el envío a
  revisión detrás del build con la casilla `submitForReview`. Las versiones se
  crean con `releaseType: AFTER_APPROVAL`, así que **la aprobación publica
  sola**, y con *phased release* de 7 días: la actualización llega poco a poco a
  quien ya tiene la app, y un build malo se pausa (`phased --state=pause`) en vez
  de necesitar una revisión urgente. A quien la descarga por primera vez le llega
  siempre la última, así que el despliegue por fases no cambia nada en 1.0.0 y
  empieza a contar en la primera actualización.

  Las novedades de la ficha salen del CHANGELOG (`extractReleaseNotes`), que es
  el texto que sí pasa por revisión en un PR; publicar una versión cuyo bloque
  `## vX.Y.Z` no se ha estampado falla en el job en vez de publicar un «What's
  New» vacío.

  **No hay ninguna clave de Apple en ningún portátil**, a propósito. Se opera
  desde **Actions → "App Store release"**, que es despachable por la API de
  GitHub —de modo que un agente puede lanzar una publicación sin tener
  credenciales de Apple— y que es *dry run* por defecto: cada comando enseña lo
  que haría y no manda nada a Apple hasta marcar `apply`.
- **Cultuvilla ya está en el App Store**, y la web se lo ofrece a quien la visita
  desde un iPhone o un iPad. `APP_STORES.ios` deja de estar vacío, con lo que se
  encienden solos los dos consumidores que llevaban escritos desde el 29 de
  agosto: el aviso de descarga sobre la navegación y la landing `/descarga`.
  Android sigue en pruebas cerradas de Play, así que su URL sigue vacía y a un
  visitante de Android no se le ofrece nada — las dos plataformas se encienden
  por separado, a propósito.

  En Safari el aviso lo dibuja **Apple**, no nosotros: `app/+html.tsx` emite la
  etiqueta `apple-itunes-app` y `SmartAppBanner` se aparta para no apilar dos
  barras que dicen lo mismo. En cualquier otro navegador de iOS —Chrome, Firefox
  y sobre todo los navegadores integrados de Instagram o WhatsApp, por donde se
  abre la mayoría de los enlaces compartidos— esa etiqueta no hace nada y el
  aviso propio sigue siendo la única oferta. Lo decide
  `rendersNativeSmartBanner`, que reconoce al Safari de verdad por la *ausencia*
  del distintivo del navegador que lo envuelve, porque todos ellos son WebKit y
  todos mandan «Safari» en su user agent.

  `pnpm check:store-claims` comprueba además que cada URL de `APP_STORES`
  apunta a una ficha realmente pública. La autoridad es **la propia página**, no
  la API de lookup: el día del lanzamiento la ficha ya servía un 200 con la app
  real mientras `lookup` seguía devolviendo `resultCount: 0`, porque el índice de
  búsqueda va horas por detrás del front del store. Aprobada no es lo mismo que
  publicada, y una URL rellenada antes de tiempo manda a visitantes reales a un
  404 — pero fiarse del índice habría retenido el aviso sobre una página que ya
  funcionaba.

- **Eventos privados para una organización.** Al crear un evento con una única
  organización organizadora aparece el interruptor **«Solo para miembros»**: el
  evento deja de verse en Explora, en la pestaña del pueblo y en el enlace
  compartido para cualquiera que no sea de esa organización, y solo sus miembros
  pueden apuntarse. Los organizadores del evento lo ven siempre, aunque no sean
  socios; el resto del pueblo no, **incluidos los administradores del pueblo** —
  la cena de una peña no es la plaza del pueblo. Conservan, eso sí, su capacidad
  de editar o cancelar el evento, pero no la de volverlo público.

  La restricción se aplica en tres capas, porque cada una tiene su hueco: las
  reglas de Firestore esconden el documento, `registerToEvent` y
  `claimEventSeat` rechazan la inscripción (son Admin SDK y se saltan las
  reglas, así que un enlace reenviado bastaría), y la vista previa del enlace
  compartido devuelve una tarjeta genérica «Evento privado» sin título, texto ni
  imagen, porque ahí no hay nadie a quien autorizar.

  **Migration:** los eventos existentes reciben `visibility: 'public'` y
  `visibilityOrgId: null` con `scripts/backfill-event-visibility.mjs`
  (`pre-deploy`, auto-aplicado en dev/beta/prod). Sin él las consultas del feed
  —que ahora filtran por `visibility`— no devolverían ningún evento antiguo.

- **Los fallos de acceso ahora dejan rastro.** Un error al iniciar sesión era la
  única clase de error que el proyecto no podía ver, y lo era por partida doble:
  `logClientError` exigía estar autenticado —y en un login fallido no hay
  sesión, así que la llamada se rechazaba y `sendClientError` se tragaba el
  rechazo en silencio— mientras `authErrorMessage` sustituye todo
  `Firebase: Error (auth/…)` por copy genérica, de modo que el código tampoco
  llegaba a quien estaba delante de la pantalla. Apple rechazó la 1.0.0 por un
  error de login del que no quedó ni una línea de log.

  Ahora `logClientError` **acepta reportes sin autenticar** (los marca con
  `authenticated: false` y sin `user.id`, porque no hay identidad que
  pseudonimizar) y las cuatro rutas de fallo de `login.tsx` reportan vía
  `reportAuthError`, que etiqueta el proveedor en `operation` y **calla ante una
  cancelación** del usuario. La copy que ve la persona no cambia.

- **Zoom en las imágenes.** Tocar una foto la abre a pantalla completa sobre
  fondo negro: se hace zoom pellizcando, se arrastra para moverla, un toque doble
  alterna entre encajada y 3x, y se cierra deslizando hacia abajo o con la ✕. El
  visor pide el archivo **original**, no la versión reducida que muestra la
  pantalla — ampliar un `card` de 1080px solo agranda el borrón.

  Se aplica a las imágenes de contenido: el cartel de cabecera de cada ficha
  (evento, cartel de fiestas, lugar, barrio, organización, noticia), las
  imágenes dentro del cuerpo de una noticia, el retrato de una persona y el
  escudo grande del pueblo. Deliberadamente **no** a las miniaturas del feed ni a
  las de los listados, donde tocar tiene que seguir llevándote a la ficha, ni a
  las previsualizaciones de los formularios.

  Está construido sobre `Animated` + `PanResponder` de React Native, sin
  `gesture-handler` ni `reanimated`: ninguno de los dos está instalado y añadirlos
  cambiaría la huella nativa, así que el zoom solo llegaría con un binario nuevo
  de tienda. Tal como está, viaja por OTA y funciona también en la web. La
  geometría vive aparte, en `apps/mobile/lib/imageZoom.ts`, con tests unitarios.

- **Aviso de descarga en la web.** Quien entra a cultuvilla.es desde un móvil ve
  una barra que le ofrece la app de su plataforma — App Store en iOS, Google Play
  en Android — y que empuja el contenido hacia abajo en vez de taparlo, como hace
  la barra nativa de Safari. En escritorio no aparece: no hay tienda a la que
  mandar a nadie. Se puede cerrar, y entonces calla 30 días; es un aplazamiento,
  no una renuncia, porque quien dice «ahora no» en junio puede querer la app en
  julio y no hay cuenta donde guardar esa preferencia (la barra también se ve sin
  iniciar sesión).

  Queda **latente hasta que las fichas de tienda sean públicas**: cada plataforma
  se enciende por separado, en cuanto se rellena su URL en
  `apps/mobile/lib/appStores.ts`. A 2026-08-29 ninguna de las dos carga todavía
  (Play sigue en prueba cerrada; la ficha de App Store existe pero sin publicar),
  así que hoy no se muestra a nadie. Es un cambio de una línea por tienda, sin
  despliegue de nada más.

  La detección de plataforma vive en `resolveStorePlatform`
  (`packages/shared/src/utils/storeBanner.ts`) y está probada contra user-agents
  reales, incluido el caso que rompe a casi todo el mundo: desde iPadOS 13 un iPad
  se anuncia como un Mac de escritorio, y lo único que los distingue es que el iPad
  declara puntos táctiles.

- `pnpm check:store-claims` comprueba ahora que **cada proveedor de acceso que
  la app ofrece está habilitado en los tres entornos**. Un proveedor que la UI
  ofrece pero el proyecto no habilita sólo falla en runtime, y ningún test del
  repo podía verlo.

### Fixed

- **Los botones de acción ya no se parten en dos líneas.** En Pueblo (y en
  Perfil) las píldoras terracota —Unirme, Añadir contenido, Compartir, Rellenar
  censo…— repartían su ancho a partes iguales, así que una etiqueta larga, o el
  tamaño de letra grande del sistema, la mandaba a una segunda línea. Ahora la
  etiqueta **se encoge hasta caber en una línea** y nunca se recorta con `…`:
  truncar el nombre de una acción es peor que hacerlo pequeño. Por debajo del
  75% del tamaño base deja de encoger y se permite la segunda línea, de modo que
  no se pierde texto en ningún caso.

  `adjustsFontSizeToFit` no servía: RN-Web no lo implementa y degrada justo a esa
  elipsis, así que la etiqueta se mide sin restricciones y se escala por la
  proporción, igual en nativo que en la web. De paso, el escalado de fuente del
  sistema se limita a 1.3 en estas píldoras y las siete copias del mismo marcado
  pasan a ser una primitiva, `<ActionPill>`.

- **Proveedor `apple.com` habilitado en Firebase Auth.** No estaba activo en
  ninguno de los tres entornos, así que el botón de Sign in with Apple
  —correcto en el cliente y con sus tests en verde— moría en
  `auth/operation-not-allowed` al llamar a `signInWithCredential`. Apple rechazó
  la submission de 1.0.0 mencionando un error al entrar con Apple (guideline
  2.1(a)). Habilitado en `villa-events`, `cultuvilla-beta` y `cultuvilla-prod`;
  es configuración de servidor, no requiere cambio de cliente ni build nueva.

  **No está confirmado que esto agote el fallo.** Un tester sigue viendo el
  diálogo del propio iOS («no se ha completado el registro»), que aborta en la
  capa nativa *antes* de que se llame a Firebase, así que es un fallo distinto
  del que arregla este cambio. La capability `APPLE_ID_AUTH` del App ID, el
  perfil de aprovisionamiento (`com.apple.developer.applesignin`) y el nonce del
  cliente están verificados y correctos; falta el código de `ASAuthorizationError`
  para saber más.

## v1.0.0 — 2026-08-28

Primera publicación pública en las tiendas: App Store y Google Play. Sin
cambios funcionales respecto a v0.30.0 — el salto de versión en sí es el hito,
requerido por Apple para aceptar la ficha de la app (rechaza versiones `0.x`).

## v0.30.0 — 2026-08-27

Sin cambios para quien usa la app. Esta versión existe porque la promoción a beta
lleva siempre un número nuevo (AGENTS.md → *Versioning & releases*), y lo que
arrastra es la primera ejecución real de las pruebas E2E en Android — que hasta
0.29.0 nunca se había ejecutado, porque se añadió en una PR que no tocaba las
rutas de release.

### Fixed

- **Escribir un artículo ya no va a tirones.** Al abrir el formulario de artículo
  se notaba todo pesado — el desplegable de categoría tardaba segundos en
  abrirse — aunque el problema no era ese campo, sino la pantalla entera: el
  cargador de menciones (`@`) pedía **todos** los municipios del INE, 8.167
  documentos, y los pasaba uno a uno por el conversor estricto en el hilo de JS
  justo al montar. Los primeros toques se quedaban esperando detrás de ese
  trabajo. Ahora pide solo los pueblos con comunidad activada, que es el único
  conjunto que tiene ficha a la que enlazar: 2 documentos en beta en vez de
  8.167 (y otras tantas lecturas facturadas menos por cada vez que se abre la
  pantalla).

- **El teclado ya no tapa lo que estás escribiendo en un comentario.** El
  compositor vive al final del scroll de la ficha (evento, noticia, sitio,
  barrio, cartel, organización), justo donde aparece el teclado. Android es
  edge-to-edge desde Expo SDK 54, así que la ventana ya no se encoge sola
  (`adjustResize` dejó de ser una opción) y el teclado caía encima del campo. Ahora
  el andamio de ficha encoge el área de scroll (`KeyboardAvoidingView`) y el
  propio compositor se desplaza a la vista al recibir el foco y cada vez que el
  teclado se abre — también al pulsar «responder» con el teclado ya abierto, que
  no emite ningún evento de teclado.

- **El campo de comentario crece con el comentario.** Antes era de una línea:
  un texto largo se iba desplazando y sólo se veía el final. Ahora crece hasta
  ~6 líneas y a partir de ahí hace scroll dentro del propio campo, así que
  siempre se puede releer entero lo escrito. Como es multilínea, la tecla Enter
  ya inserta un salto de línea en vez de enviar: se envía con la flecha.

- **La suite E2E de Android ya se ejecuta de verdad, y pasa.** En su estreno se
  quedó a medias: el APK no llegaba a compilarse porque
  `:expo-updates:kspReleaseKotlin` agotaba los 512 MB de metaspace que da la
  plantilla de Expo, y el demonio de Gradle, en vez de morirse, se quedaba una
  hora dando vueltas hasta agotar el tiempo del job — así que el fallo se
  presentaba como «cancelado», que parece falta de máquinas y no falta de
  memoria. Con el techo subido y `--no-daemon`, un fallo mortal muere en nueve
  minutos y dice lo que es.
  - **Y tres recorridos no veían lo que tenían delante.** Ninguno era un fallo de
    la app: el botón de apuntarse queda por debajo del pliegue en un pixel_5, y
    el teclado del móvil tapa el enviar de los comentarios y el selector de sexo
    del formulario. Nada de esto lo puede ver la suite web, porque en
    react-native-web el teclado no existe como capa encima — que es exactamente
    la razón de ser de la suite nativa.
  - **Un hallazgo de producto, sin arreglar todavía.** Con el teclado abierto, en
    Android nativo la ventana no se redimensiona: 25 barridos de pantalla
    completa movieron la página exactamente cero píxeles. Se escribe un
    comentario sin ver ni el campo ni el botón de enviar. Se puede enviar con la
    tecla del propio teclado, así que está deslucido, no roto.
  - **El paso que habilita KVM ya no tumba el job.** `udevadm control
    --reload-rules` devuelve 1 en algunas máquinas de GitHub y, bajo `bash -e`,
    eso se llevaba por delante toda la ejecución — tres veces en una noche— con
    `/dev/kvm` ya escribible y el emulador listo para arrancar.
  - **`50-onboarding-complete-profile` queda en cuarentena**, anunciada en cada
    ejecución. Se cuelga al crear el perfil por la conexión en claro del SDK
    nativo con el emulador de Firestore, algo que ningún cliente real usa; el
    camino de producto lo cubre el espejo web, que pasa.

## v0.29.0 — 2026-08-26

### Added

- **Historial de inscripciones, sólo para quien organiza.** Anular una inscripción borra la fila del todo, así que hasta ahora quien organizaba un evento no tenía forma de ver que alguien se había apuntado y luego se había ido — ni de distinguir «se dio de baja» de «le quitaron». Cada cambio en la lista de asistentes deja ahora un apunte en `events/{id}/registrationEvents/`, escrito por la propia función en la misma transacción que el cambio: altas, altas en la puerta, plazas de grupo ocupadas o devueltas, saltos desde la lista de espera, bajas propias, expulsiones, grupos anulados y el barrido que se lleva la lista entera cuando se desactivan las inscripciones. Aparece plegado bajo la lista de asistentes, en la pantalla del evento.
  - **No lo ve el pueblo.** Las reglas lo limitan a quien organiza el evento, a las personas administradoras del pueblo y a las de la app — ni siquiera lo ve la persona a la que se refiere el apunte, y da igual lo abierta que esté la lista de asistentes: nombra a gente que ya no está en ella.
  - **Nadie puede escribirlo ni corregirlo desde la app**, tampoco quien administra: es un registro para rendir cuentas, y sólo lo escribe el servidor.
  - Empieza vacío: lo ocurrido antes de este despliegue no se puede reconstruir, porque esas filas ya no existen.

### Changed

- **Las imágenes de la app cargan mucho más rápido.** Las pestañas de pueblo y explora tardaban en pintar porque cada tarjeta se descargaba la foto **original** — hasta 2,8 MB en dev — para meterla en una caja de unos 400 dp, y encima la volvía a descargar cada vez, porque Firebase Storage servía todo con `cache-control: private, max-age=0`. Se ha arreglado en las cuatro capas a la vez:
  - **Cabecera de caché en todas las subidas.** `imageService` estampa ahora `public, max-age=31536000, immutable` en cada objeto. El nombre de cada fichero es único y nunca se sobrescribe, así que `immutable` es literal: los bytes detrás de una URL no pueden cambiar. Volver a una pestaña ya no vuelve a descargar nada.
  - **Se sube una imagen del tamaño razonable.** Lo elegido en el carrete se redimensiona a 1600 px de lado largo y se recodifica a WebP (JPEG en web, donde el `canvas` no garantiza WebP) antes de subirlo. Nada en la app pinta una imagen más ancha que la pantalla, así que una foto de 4000 px eran entre 20 y 50 veces más píxeles de los que se llegan a ver — y ahora **publicar** también es más rápido, que es lo que se nota en una conexión de pueblo.
  - **Versiones reducidas generadas en el servidor.** Un disparador nuevo, `generateImageVariants`, escribe junto a cada imagen dos copias en WebP: `_card` (1080 px, para tarjetas y portadas) y `_thumb` (240 px, para avatares). No se guarda ninguna URL nueva en ningún documento — la variante se direcciona **por convención**, reescribiendo la URL del original, de modo que añadir una versión no toca ni un esquema ni un conversor. Si una variante todavía no existe, la app se cae con elegancia al original.
  - **Caché de verdad en el cliente.** Todas las imágenes remotas pasan ahora por un primitivo único, `RemoteImage`, montado sobre `expo-image`: caché en memoria **y** en disco, `recyclingKey` para que una fila reciclada no enseñe la imagen de la anterior, y la dimensión natural leída del propio decodificado — lo que elimina la petición extra que `Image.getSize` hacía por cada tarjeta.
  - **Medido en dev:** las 104 imágenes de usuario suman 42,2 MB en original y 5,5 MB en versión `_card` — 7,7 veces menos. Un cartel de fiestas concreto pasa de 660 KB a 215 KB en tarjeta y a 9,5 KB en avatar.
  - **Requiere binario nuevo.** `expo-image` y `expo-image-manipulator` son módulos nativos, así que esta parte **no viaja por OTA**: llega con la siguiente build de tienda. Las otras tres capas son de servidor y sí surten efecto de inmediato.
  - **Migration:** los objetos ya almacenados se reparan con `scripts/backfill-image-cache-control.mjs` (cabecera de caché; se auto-aplica en el despliegue) y `scripts/backfill-image-variants.mjs` (genera las versiones reducidas; **se lanza a mano por entorno** desde Actions → "Run Backfill", porque recodifica todas las imágenes). Ambos son idempotentes y no modifican los originales. Ya aplicados en dev.

- **El rango de años de nacimiento de un evento se pide sólo si lo hay.** El paso de Detalles gastaba una etiqueta, un párrafo y dos casillas numéricas en un campo que la inmensa mayoría de los eventos deja vacío: una verbena no tiene edad, y quien la creaba tenía que leer y descartar el bloque entero cada vez. Ahora es un interruptor — **«Limitar la edad»** — y los años «Desde» y «Hasta» aparecen debajo sólo cuando se enciende, con un año de ejemplo dentro de cada caja («Ej. 1990», «Ej. 2014») que además enseña de qué lado va cada uno.
  - **La explicación se va detrás de la «ⓘ»**, como los demás interruptores del paso, y recoge las tres cosas que hacía falta decir en alguna parte: que es orientativo y quien no cumpla podrá apuntarse confirmándolo, que dejar un extremo en blanco lo deja abierto, y que a quien no tenga año registrado no se le pregunta. El párrafo bajo el control empujaba los controles mismos fuera de pantalla, que es justo la razón por la que este paso ya movía sus explicaciones ahí.
  - **Apagar el interruptor no borra lo escrito.** Un toque desviado no puede destruir dos años ya tecleados, así que el texto se conserva y lo que decide es el interruptor: apagado, el evento se guarda sin rango. Es el mismo patrón con el que las opciones de inscripción cuelgan de «Admite inscripciones».
  - **No cambia ningún dato.** `minBirthYear` y `maxBirthYear` conservan su forma exacta, así que no hay migración ni despliegue: los eventos que ya tienen un rango abren el formulario con el interruptor encendido.

- **Avisar de una actualización con un diálogo, no con una franja.** La app ya sabía desde el arranque si la versión instalada se había quedado corta, pero lo contaba mal: quedarse por debajo de `minSupported` sustituía la app entera por una pantalla suelta, y haber una versión nueva pintaba una franja naranja de una línea sobre la cabecera que se confundía con parte del diseño y que nadie llegaba a pulsar. Ahora son **dos diálogos** sobre la app, como en Órdago:
  - **Bloqueante** cuando la versión ya no es compatible: no se puede cerrar — sin «Más tarde», sin botón atrás de Android, sin tocar fuera — y su único camino es «Actualizar ahora», que abre la ficha de la tienda.
  - **Avisador** cuando sólo hay una versión más nueva: «Actualizar ahora» o «Más tarde», y la app sigue detrás.
  - **El avisador no da la lata.** Recuerda en el dispositivo qué versión anunció y se calla **tres días** antes de repetirla; una versión *nueva* reinicia esa espera, así que un lanzamiento de verdad se anuncia al momento. El bloqueante no tiene espera: sale en cada arranque, que para eso es un muro.
  - **Sigue sin existir en web**, donde el gate resuelve siempre `ok`: la web se actualiza al recargar y no hay tienda a la que mandar a nadie. Y sigue fallando abierto — una lectura mala del documento de configuración no puede dejar la app inservible.
  - **No necesita despliegue de datos.** `config/appVersion` ya existe en dev, beta y prod con `minSupported` a `0.0.0` (el muro sigue dormido antes del lanzamiento en tiendas, según AGENTS.md) y con la URL real de Google Play; la de App Store sigue siendo el marcador de posición hasta que haya app publicada en iOS.

### Fixed

- **El correo de cancelación ya sale de verdad.** Anular una inscripción escribía la cancelación y no enviaba nada: `cancelRegistration` era el único emisor de correo que no declaraba `secrets: [RESEND_API_KEY]`, así que Firebase no montaba la clave en su Cloud Run, Resend contestaba «Missing API key» y `sendEventEmail` — best-effort por contrato — se lo tragaba en silencio. Un test de invariante recorre ahora el grafo de imports real y falla si cualquier punto de entrada puede llegar a `RESEND_API_KEY.value()` sin declararlo, algo que los tests de handler no podían ver porque mockean el secreto.

## v0.28.0 — 2026-08-25

### Added

- **Rango de años de nacimiento por evento, como aviso y no como muro.** Un taller infantil, una merienda de mayores o una comida de quintos se anuncian por edad, pero la app no tenía dónde decirlo: quien organizaba lo escribía en la descripción y quien se apuntaba no lo leía. Ahora el formulario de evento tiene **«Años de nacimiento» — desde / hasta**, ambos opcionales (dejar uno vacío deja ese extremo abierto), el rango se muestra en la ficha del evento («Nacidos entre 2014 y 2020»), y al apuntar a alguien que no lo cumple sale un diálogo con su nombre pidiendo confirmación. Se puede seguir adelante: es el aviso lo que faltaba, no el permiso.
  - **Es orientativo a propósito, no una regla del servidor.** Ni las reglas de Firestore ni el callable rechazan a nadie por su año: quien organiza añade asistentes a mano y las plazas abiertas las reclama quien recibe el enlace, y un muro de verdad dejaría tirados a los dos. Las reglas sí validan la *forma* del rango (entero entre 1900 y 2200, el final nunca anterior al inicial).
  - **A quien no tiene año registrado no se le pregunta.** Toda persona creada en la app lleva fecha de nacimiento completa, así que un año ausente es un documento antiguo, no un desajuste: preguntarlo sería dar la lata sin motivo. Tampoco se vuelve a preguntar por quien ya está apuntado.
  - **Migration:** `scripts/backfill-event-birth-year-window.mjs` (por entorno, auto-aplicado en el deploy).
- **Las pruebas E2E ya se ejecutan sobre la app de verdad, en un Android real, antes de cada promoción a beta.** Hasta ahora la única suite E2E corría en el navegador (Playwright sobre la exportación web), y como el web build usa react-native-web se probaba el mismo árbol de React pero nunca la plataforma: el arranque nativo, la ruta de los enlaces profundos, la persistencia de sesión en AsyncStorage, el SDK nativo de Firebase, los modales y el teclado de RN. Ahora un workflow nuevo (`android-e2e.yml`) compila un APK autónomo, arranca un emulador Android y le pasa **ocho recorridos** con Maestro: alta y baja en un evento, apuntar a una persona a tu cargo, unirse a un pueblo, comentar, completar el perfil de alta y el enlace profundo anónimo.
  - **`Alert.alert` nunca se había ejecutado en una prueba.** react-native-web lo publica como una función vacía, así que ningún test web ha llegado jamás a pulsar un diálogo de confirmación; el recorrido de darse de baja es el primero que lo hace.
  - **La afirmación fuerte sigue siendo el estado de Firestore, no la pantalla.** Los recorridos leen el emulador por REST igual que la suite web, así que lo que se prueba es el efecto real en el backend y no lo que el móvil dibuja.
  - **Se ejecuta en las rutas de release (`beta`/`main`), no en cada PR a `develop`**, como ya hacía la suite web: compilar con Gradle y arrancar un emulador es demasiado lento para el día a día, y beta es la última parada antes de que algo se convierta en binario de tienda.
  - **El atajo de login de las pruebas ya no puede colarse en un binario de tienda por accidente, sino por imposibilidad declarada.** Antes lo impedía que el atajo fuera sólo de web; ahora que Maestro también lo necesita, `app.config.ts` se niega directamente a compilar un bundle de beta o producción con `USE_FIREBASE_EMULATOR=1`, en cualquier camino de compilación (CI, EAS o un portátil).
  - **Dos retoques en la app, ambos por lo mismo: un toque automático apunta al CENTRO de lo que toca.** La casilla de «Acepto los términos» ocupaba toda la fila, y su centro cae sobre el enlace a los Términos de uso — así que el toque abría la pantalla legal en vez de marcar la casilla; ahora la casilla tiene su propio identificador. Y el botón «Editar perfil» lleva uno también: es lo único que sólo aparece cuando la sesión, el perfil y la persona se han cargado de verdad, así que es lo que las pruebas miran para decir «esto está dentro».

- **Avisar por correo cuando una plaza desaparece, no sólo cuando se consigue.** Apuntarse mandaba un correo de confirmación; que te dieran de baja no mandaba nada — ni correo ni notificación —, así que quien organizaba podía borrarte de un evento y la única forma de enterarte era volver a abrir la ficha. Ahora cancelar una inscripción manda el mismo correo con la misma imagen y los mismos datos del evento, en dos versiones: **«Inscripción cancelada»** cuando te has dado de baja tú (un resguardo) y **«Te han dado de baja»** cuando lo ha hecho la organización o quien reservó el grupo (una noticia). El correo enumera las plazas perdidas y lleva al evento por si quieres volver a apuntarte; ya no habla de aforo ni de lista de espera, porque describen una plaza que ya no tienes.
  - **La notificación es el registro duradero, el correo es el mejor esfuerzo.** Que te den de baja escribe además una notificación `registration_removed` en la app; enviarte tú mismo una notificación de algo que acabas de hacer sería ruido, así que la baja propia sólo manda el resguardo por correo.
  - **Un aviso por persona, no por plaza.** Al disolverse un grupo cada afectado recibe un solo correo con todas sus plazas y una sola notificación. Las plazas libres sin nombre no se enumeran, y devolver una plaza a un grupo (`release-seat`) sigue avisando sólo en la app a quien lo reservó: ahí no se pierde nada.
  - **Las pruebas de la plantilla de correo no se ejecutaban.** `test/email/` no estaba en el `include` de ninguna configuración de vitest, así que los 22 tests de `registrationEmailTemplate` llevaban desde que se escribieron sin correr en CI. Ya están dentro.

### Fixed

- **Buscar a alguien al añadir organizadores a un evento.** Matabuena tiene 165 vecinos y el selector los listaba en el orden en que Firestore devuelve los documentos —es decir, por UID, un orden arbitrario— dentro de una caja de 320 px y sin buscador. Estaban todos, pero encontrarse a uno mismo era cuestión de suerte: de ahí la impresión de que «no salen todos». Ahora ambos selectores («Añadir persona» y «Añadir grupo») llevan **buscador**, ordenan **alfabéticamente** y **fijan arriba lo que ya estaba seleccionado**, para poder quitarlo sin recorrer la lista entera. La búsqueda ignora tildes y mayúsculas: *martin* encuentra *Martín*.
  - **Y el selector se abre entero.** Es la misma hoja inferior que el botón «Añadir contenido» del pueblo: crece con su contenido hasta el 85 % de la pantalla, se cierra **arrastrándola hacia abajo** (en el móvil nativo; en web no hay gesto, así que la barrita, la ✕ y el fondo siguen siendo la salida) y ya no encierra la lista en un recuadro fijo. Vive en un primitivo nuevo, `BottomSheet`, del que podrán colgar las demás hojas.
  - **Y carga en dos consultas en vez de en trescientas.** Los nombres y las fotos salen ahora del directorio `municipalityPeople`, que ya los tiene; antes se pedía el perfil y la persona de **cada** vecino, unas 331 lecturas en Matabuena, y la hoja se abría a medio llenar. Quien no esté en el directorio se sigue resolviendo por su documento de usuario, así que nadie desaparece de la lista.

- **Los pueblos que ya estaban activos también reciben sus localidades.** La siembra de pedanías, aldeas, parroquias y barrios ocurría al *activar* un pueblo, así que ningún pueblo activado antes de 0.26.0 la vio nunca: en producción eran los 17, incluido Figueruela de Arriba — precisamente el municipio de Villarino de Manzanas, el caso que originó todo esto. Los datos estaban en `_admin/settlements/seeds` y no llegaban a nadie: se podía *buscar* el pueblo por su pedanía, pero al abrirlo no había ni una localidad. Un backfill los siembra ahora en los pueblos ya existentes.
  - **Sólo añade; nunca pisa lo que hay.** El pueblo ya tiene contenido —filas creadas a mano, con fotos, comentarios y vecinos asociados—, así que se salta cualquier fila cuyo id **o cuyo nombre** ya exista. La comprobación por nombre es la que importa: un «Cañicosa» hecho a mano tiene id aleatorio y la semilla crearía `osm-pedania-canicosa`, ids distintos para el mismo sitio, y el pueblo acabaría listándolo dos veces con la copia vacía al lado de la buena. Los nombres se comparan sin tildes, mayúsculas ni puntuación. En dev sembró 99 entidades en 12 pueblos y respetó el «Nuevo Aranjuez» que ya existía; una segunda pasada escribe 0.
  - **Y las filas que ya existían se reclasifican, sin cambiarles el id.** Un pueblo anterior a la siembra tenía todo catalogado como `barrio`, porque es lo único que el cliente puede crear: las reglas fijan `kind: 'barrio'`, `source: 'user'`, `isSeat: false` en toda fila escrita desde la app. Así que el `kind` de una fila hecha a mano nunca fue una decisión —la interfaz no daba forma de expresarla— y corregirlo contra OSM no pisa ninguna elección. En producción son exactamente tres filas, las de Matabuena: «Cañicosa», «Matabuena» y «Matamala» son las tres pedanías del municipio, una de ellas la capital, y estaban las tres en la sección de Barrios.
    - **Se parchean los campos, no se renombra el documento.** Cambiarle el id para que coincidiera con el de la semilla sería un borrado más un alta, y `barrioId` es una clave ajena: apuntan a ella `persons.residenceLinks` y `municipalityPeople`, y de ella depende `syncBarrioResidentCount`. Esas tres filas suman 167 vecinos. El id está bien; lo que estaba mal eran dos campos.
    - `source` se queda en `user`: es la procedencia real, y además mantiene la fila emparejada por nombre en cada pasada posterior, así que la reclasificación no se repite.
  - **Migration:** `scripts/backfill-existing-village-settlements.mjs` (por entorno, auto-aplicado en el deploy, después de `settlement-seeds` y `barrio-kind`).

## v0.27.0 — 2026-08-24

### Fixed

- **El despliegue a beta/producción ya puede aplicar sus migraciones.** El paso «Auto-apply opted-in backfills» moría con `Firebase app named "[DEFAULT]" already exists` en cuanto encontraba un backfill sin marcador, y con él caía el despliegue entero: `initAdminForEnv` llamaba a `initializeApp` sin comprobar si ya había una app, y en ese camino se llama dos veces — una en el bucle de auto-aplicación para leer los marcadores y otra dentro de `executeBackfill`. Ahora reutiliza la app existente, y **se niega a reutilizarla si apunta a otro proyecto**: devolverla en silencio escribiría datos de un entorno en otro.
  - **Llevaba meses latente y nadie lo vio**, porque el bucle se salta todo backfill ya marcado: `executeBackfill` sólo se alcanza en un despliegue con migraciones realmente nuevas, y v0.26.0 fue el primero. La ruta de un solo backfill (el workflow «Run Backfill») nunca pasó por ahí, así que seguía funcionando y ocultaba el fallo.

## v0.26.0 — 2026-08-24

### Fixed

- **Buscar el pueblo por el nombre de la pedanía, y no sólo por el del municipio.** Cultuvilla lista los 8.167 municipios del INE, pero la mayoría de los pueblos españoles no son municipios: Villarino de Manzanas es una entidad singular de Figueruela de Arriba, así que quien buscaba el nombre del sitio donde de verdad vive no encontraba nada y concluía, con razón, que faltaba su pueblo. Ahora cada municipio indexa también los nombres de las entidades singulares que contiene, y la ficha del resultado dice cuál de ellas ha provocado la coincidencia («Incluye Villarino de Manzanas»), para que no parezca una respuesta equivocada.
  - **Una pedanía es un alias, no una entidad.** No se crea ninguna colección nueva: a una pedanía no puedes unirte, ni publicar en ella, ni administrarla — sólo sirve para llevarte a su municipio. Guardarla como alias reutiliza tal cual el índice `searchPrefixes` que ya existe, sin servicio, reglas, índice ni pantalla nuevos.
  - **La cobertura es parcial y mejora sola.** Los datos vienen de Wikidata, la misma fuente y las mismas herramientas que el listado de municipios, así que el fichero se regenera con `node scripts/fetch-localities.mjs`. Los nomenclátores oficiales (INE, IGN) no tienen descarga automatizable, y un fichero que sólo se puede bajar a mano se queda obsoleto en silencio. Donde falte una pedanía, el mensaje de búsqueda vacía sigue explicando que hay que buscar el municipio.
  - **Migration:** el campo `localityNames` de `municipalities` lo rellena el mismo `scripts/backfill-municipality-search-prefixes.mjs` (por entorno, auto-aplicado en el deploy).

- **Buscar el pueblo por cualquier palabra de su nombre, no sólo por la primera.** La búsqueda comparaba lo escrito contra el principio del nombre completo, y el 42% de los municipios españoles tienen nombre de varias palabras que empieza por un genérico compartido: quien escribía «Manzanas» no encontraba *Villanueva de las Manzanas*, y quien escribía «Aires» no encontraba *Villarino de los Aires*. Ahora cada municipio indexa un prefijo por **cada palabra** de su nombre, así que se busca por la parte distintiva, que es la que uno escribe.
  - **También por el nombre en la lengua cooficial.** El listado guardaba sólo el exónimo castellano — «San Sebastián», «Lérida», «La Coruña», «Alicante» —, de modo que buscar «Donostia», «Lleida», «A Coruña» o «Alacant» no devolvía nada. 2.122 municipios incorporan ahora su nombre en euskera, catalán, gallego, asturiano, aragonés u occitano, y se busca indistintamente por cualquiera de ellos.
  - **Los dos grupos de resultados ya no se contradicen.** «Municipios activos» filtraba en el cliente distinguiendo mayúsculas y tildes mientras «Todos» consultaba en Firestore sin distinguirlas, así que un mismo pueblo podía salir en un grupo y no en el otro para la misma búsqueda. Ahora ambos evalúan exactamente el mismo criterio.
  - **Cuando no hay resultados se explica por qué.** Cultuvilla lista los 8.167 municipios del INE y nada por debajo, así que quien vive en una pedanía busca un nombre que no existe como fila y concluye que falta su pueblo. El mensaje vacío ahora dice que sólo aparecen municipios y que hay que buscar el municipio al que pertenece la pedanía, con un ejemplo.
  - **Migration:** los campos `searchPrefixes` y `nameAliases` de `municipalities` los rellena `scripts/backfill-municipality-search-prefixes.mjs` (por entorno, auto-aplicado en el deploy). Los alias se regeneran con `node scripts/enrich-municipality-aliases.mjs`.

### Added

- **Exportar la lista de asistentes a Excel o CSV ya funciona en la app, no sólo en la web.** El control de descarga del roster existía desde 0.24.0 pero se ocultaba en iOS y Android, porque guardar un fichero allí necesita módulos nativos que la app no traía; el organizador que gestiona su peña desde el móvil — que es la mayoría — no tenía forma de sacar la lista. Ahora el fichero se escribe en la caché de la app y se entrega a la hoja de compartir del sistema, que es donde viven «Guardar en Archivos», Drive, WhatsApp y el correo. El `.xlsx` y el `.csv` son exactamente los mismos que genera la web: mismo libro con logo, cabecera fija y filtros, y mismo CSV UTF-8-BOM con punto y coma.
  - En iOS se envía además el UTI del tipo de fichero (`org.openxmlformats.spreadsheetml.sheet`, `public.comma-separated-values-text`): sin él el sistema no sabe qué apps pueden abrir la hoja y ofrece una lista vacía.
  - `downloadFile` pasa a ser un par dividido por plataforma (`downloadFile.ts` nativo, `downloadFile.web.ts` web) en lugar de una única función con un `Platform.OS` dentro. Metro resuelve el fichero en tiempo de build, así que `expo-file-system` y `expo-sharing` no pueden colarse en el bundle web — que es exactamente el fallo que tumbó el export web en su día y que `scripts/check-web-export.mjs` vigila.
  - Los textos del diálogo dejan de decir «descargar»: en el móvil no hay descarga, hay una hoja de compartir.
  - **Requiere un binario nuevo.** Son dos módulos nativos, así que el fingerprint cambia y EAS Update no puede servir esto por aire a las builds ya instaladas: llega con el siguiente binario del track cerrado. No se añade el config plugin de `expo-sharing` a propósito — sólo sirve para *recibir* contenido compartido en la app (una share extension de iOS con su App Group), y aquí sólo compartimos hacia fuera.
- **Un pueblo ya no es sólo un municipio: ahora tiene por dentro sus pedanías, aldeas, parroquias y barrios.** España no tiene una sola palabra para «parte de un municipio», y hasta ahora Cultuvilla sólo tenía `barrios`, así que una pedanía —un pueblo separado, a kilómetros, con su nombre y a menudo su junta vecinal— tenía que hacerse pasar por un barrio, que es un vecindario *dentro* de un núcleo. Cada tipo tiene ahora su propia sección horizontal, titulada con la palabra que de verdad se usa en esa comarca: **Localidades**, **Aldeas**, **Parroquias** y **Barrios**. Un pueblo castellano ve sólo «Localidades»; uno gallego, «Parroquias» y «Aldeas»; una ciudad, «Localidades» y «Barrios». Las secciones vacías no se pintan, así que ninguna ocupa sitio donde no aplica.
  - **La capital del municipio también es una fila.** Si no lo fuera, los vecinos del pueblo principal no tendrían dónde vivir mientras los de las pedanías sí, y el censo y el recuento de vecinos quedarían asimétricos. Y no siempre se llama como el municipio: la capital de Aramaio es una aldea llamada **Ibarra**, de ahí que el origen sea el `admin_centre` de OpenStreetMap y no una comparación de nombres — eso subió las capitales identificadas de 6.528 a 8.100 de 8.167.
  - **Los datos vienen de OpenStreetMap** (`scripts/fetch-settlements.mjs`): 23.902 localidades, 40.685 aldeas, 4.691 parroquias y 22.827 barrios, en 8.131 de los 8.167 municipios. Los nomenclátores oficiales (INE, IGN) no tienen descarga automatizable, y un fichero que sólo se baja a mano se queda obsoleto en silencio. Incluye la atribución «© OpenStreetMap contributors» que exige la licencia ODbL.
  - **Al activar un pueblo, sus localidades aparecen solas.** `startVillage` siembra las entidades de ese municipio desde los datos de OSM, así que quien enciende su pueblo se encuentra la página ya poblada en lugar de un cascarón vacío. Es idempotente (el id de cada fila sale de tipo + nombre), va fuera de la transacción —Vigo tiene 829 entidades y una transacción admite 500 escrituras— y **nunca hace fallar la activación**: si faltan los datos o están corruptos, el pueblo nace igual y se registra el aviso.
  - **Todo queda editable por el administrador.** La siembra es un punto de partida, no una fuente de verdad: se puede renombrar y borrar cualquier fila. `kind`, `source` e `isSeat` sí son estructurales y no se tocan desde el cliente, que además sólo puede crear `barrio`.
  - **Migration:** `scripts/backfill-settlement-seeds.mjs` carga el dataset en `_admin/settlements/seeds` (por entorno, auto-aplicado en el deploy), y `scripts/backfill-barrio-kind.mjs` (por entorno, auto-aplicado en el deploy) pone `kind`/`source`/`isSeat` en los barrios existentes; todos los que hay hoy se crearon a mano, así que quedan como `kind: 'barrio'`, `source: 'user'`.
- **La exportación de asistentes incluye la fecha de nacimiento.** Quien organiza un evento con tramos de edad, un seguro que exige la edad de cada participante o una lista de menores tenía que cruzar el listado a mano con los perfiles. Ahora el CSV y el Excel llevan una columna «Fecha de nacimiento» junto al nombre. Una fecha completa se exporta como fecha real —Excel la ordena y permite calcular la edad—; una parcial («Marzo 1980», «1975»), que es lo que una persona puede haber registrado, se exporta como texto en lugar de descartarse.
  - **La columna sólo aparece cuando alguien de la lista tiene fecha registrada**, igual que la de teléfono o la de grupo: una columna vacía en cada exportación sería ruido que explicar.
  - **La fecha de nacimiento no se publica en el listado.** Es un dato personal y el documento de la inscripción lo lee todo el pueblo, así que viaja donde ya viajan el teléfono y las respuestas: en `registrationPrivate/{regId}`, que las reglas restringen a la organización del evento. Se copia desde `persons` en el momento de apuntarse, porque la ficha de una persona a cargo marcada como privada está denegada a cualquiera que no la haya creado — ni siquiera quien organiza podría leerla fila a fila.
  - **Migration:** las inscripciones ya existentes no llevaban el dato; lo copia `scripts/backfill-registration-private-birthday.mjs` (por entorno, `autoApply` en el despliegue).

### Changed

- **Las imágenes del dataset de demostración se dibujan, ya no son fotos al azar.** Venían de Lorem Picsum, y el resultado no era genérico sino directamente engañoso: la «Casa Consistorial» era una persona con gorro, el «Ayuntamiento de Aranjuez» una cámara de fotos y los Jardines del Príncipe una cordillera del Himalaya. Como esas imágenes son de donde salen las capturas de la ficha de Google Play, la tienda mostraba una app de pueblos ilustrada con fotos de otro sitio. No podemos licenciar fotos reales de Aranjuez, así que la alternativa honesta es imaginería **claramente ilustrativa**: cada archivo es una tarjeta plana en colores de marca con el glifo de lo que representa — una iglesia parece una iglesia y un cementerio un cementerio. El resultado es determinista (la paleta sale de un hash del nombre del fichero), así que regenerar no produce diff.
- **Los pueblos de demostración ya tienen escudo.** El seeder aceptaba `escudo` desde el principio, pero ninguna ficha de `demo_1` lo definía, así que la portada del pueblo mostraba un cuadrado gris con la inicial. Aranjuez y Chinchón traen ahora uno dibujado.

## v0.25.0 — 2026-08-24

### Added

- **Sign in with Apple, y el camino de CI para publicar en iOS.** `expo-apple-authentication` + `AuthContext.signInWithApple`, botón sólo en iOS junto al de Google — exigido por la guideline 4.8 de Apple en cuanto se ofrece un sign-in de terceros, así deja de bloquear la primera revisión pública de la app. `mobile-release.yml` materializa ahora la App Store Connect API key desde secrets/vars en runtime (igual que la service account de Play) y admite `testflightGroup` para mandar un build directo a un grupo de TestFlight interno, sin pasar por App Review.

- **Un `merge` a `beta` publica solo en el canal cerrado de Google Play.** Antes cada binario exigía a alguien abrir la consola y subir el AAB a mano, y eso importa más de lo que parece: el reloj de Play de «12 testers durante 14 días seguidos» sólo avanza mientras los testers *tienen* builds, así que cada paso manual era un día que el contador no corría. Ahora `beta` construye el perfil `production` (paquete `com.cultuvilla.app` — el requisito de Play es por nombre de paquete, así que una build de `com.cultuvilla.app.beta` no suma nada) y lo envía al track cerrado sin intervención. **El despliegue a producción sigue siendo manual**, que es justo la decisión que la regla protegía.

- **Las correcciones llegan a las apps ya instaladas, sin esperar a un binario de tienda.** Un `merge` a `beta` publica el bundle JS al canal `beta` de EAS Update, y la app lo recoge en el siguiente arranque. Existe por un fallo concreto: el bug de las tarjetas de detalle (`h-full`) se corrigió el mismo día en que se reportó y aun así no podía llegar a nadie — el binario más reciente tenía cuatro días, no había canal de actualizaciones y `mobile-release` no tiene credenciales de Play. Una corrección de una línea sin ninguna ruta hasta la persona que la sufría.
  - **`runtimeVersion` es `fingerprint`, nunca `appVersion`.** La MINOR sube en cada promoción `develop → beta`, así que la política `appVersion` dejaría cada actualización varada frente a los binarios ya instalados: reproduciría en silencio justo el problema que esto resuelve. Un fingerprint se deriva del grafo de dependencias nativas, así que un cambio sólo-JS conserva la versión de runtime y viaja por aire, mientras que añadir un módulo nativo la cambia y EAS se niega —correctamente— a servírsela a binarios que no pueden ejecutarla.
  - **Sólo `beta` es automático.** Publicar a producción es una decisión de release, no un efecto secundario de un merge: se hace con un `workflow_dispatch` manual sobre el mismo workflow.
  - **Una actualización nunca bloquea el arranque** (`fallbackToCacheTimeout: 0`): se comprueba al lanzar pero se aplica en el arranque siguiente, para que una red lenta no deje la pantalla de carga colgada.
  - Las invariantes quedan fijadas en `packages/shared/test/ci/otaUpdates.test.ts`. **Requiere un binario nuevo**: sólo las builds hechas a partir de este cambio están suscritas a un canal, así que quien tenga una anterior necesita instalar una vez más antes de recibir nada por aire.
### Added


### Changed

- **Al editar los asistentes de un evento, cada fila ofrece sólo la papelera.** Con «Editar» activado convivían tres controles a un dedo de distancia: la casilla de *Pagado*, el icono de llamar y la papelera. Un toque desviado marcaba a alguien como pagado o le abría el teléfono cuando lo que se quería era quitarle de la lista. El modo de edición trata de eliminar y de nada más, así que mientras está activo la casilla y la llamada se retiran; al desactivarlo vuelven a su sitio.

## v0.24.0 — 2026-08-22

### Added

- **Una cuenta de revisión con código de acceso fijo, para que Google Play y App Store puedan entrar.** El acceso a la app es un código de 6 dígitos enviado por email, así que la única otra forma de dejar entrar a un revisor de tienda es darle la contraseña de un buzón real — una credencial que además queda guardada en la consola y se reutiliza en cada revisión de cada actualización. En su lugar, **una** dirección en lista blanca recibe un código que no rota.
  - **La ruta de verificación no cambia ni un byte.** `sendAuthOtpCode` escribe el hash del código fijo en el mismo doc de `authOtpCodes` donde iría uno aleatorio y se salta el envío por Resend; `verifyAuthOtpCode` no distingue el caso. Por eso siguen aplicándose la caducidad de 10 minutos, el tope de 5 intentos por código y el límite de 5 envíos cada 15 minutos — unas 100 pruebas por hora, que es lo que mantiene un código que nunca rota fuera del alcance de la fuerza bruta.
  - **El par vive en `_admin/reviewAccess`**, no en git (el código no puede estar commiteado) ni en Secret Manager (un secreto ausente tumba el deploy de los tres entornos). Como documento, activarlo, rotarlo o revocarlo es una escritura de datos por entorno, y un entorno sin el doc sencillamente no tiene cuenta de revisión. `_admin/**` está denegado a todo cliente en las reglas.
  - `node scripts/set-review-access.mjs --env=<env> --email=… [--code=…] [--clear]` lo escribe o lo borra (`--confirm` obligatorio en beta/prod). **Revocarlo con `--clear` cuando termine la revisión** — el código sólo merece su riesgo mientras un revisor lo necesita.

### Changed

- **La página pública de eliminación de cuenta dice con precisión qué se borra y qué se conserva.** Describía los comentarios como desvinculados de tu identidad cuando en realidad se borran por completo — sólo los eventos y las noticias se anonimizan —, no mencionaba los perfiles de familiares ni las fotografías que también elimina, y no daba ningún plazo de conservación. Ahora nombra los dos únicos rastros que quedan: el registro de auditoría de administradores (identificador de usuario, nunca nombre ni correo, mientras exista ese pueblo u organización) y los registros técnicos de seguridad, 30 días. Google Play exige que esa URL especifique los tipos de datos y los plazos, y era la que menos se parecía a lo que `deleteAccount` hace de verdad.

### Fixed

- **Cancelar el registro ya te devuelve a la app.** En «Completa tu perfil», el botón de cancelar cierra la sesión (y borra la cuenta de Auth recién creada), pero la pantalla se quedaba puesta: sólo recargando salías de ella. El guardia de rutas (`resolveAuthRoute`) sólo redirigía cuando había sesión iniciada, así que una persona sin sesión seguía renderizando el grupo `(onboarding)` — el único del que no se puede salir por sus propios medios. Ahora, sin sesión y dentro de `(onboarding)`, se vuelve a `/(tabs)`; `(auth)` queda excluido a propósito, que es donde se inicia sesión.

- **El perfil de otra persona ya no sale en blanco.** Al abrir `/user/<uid>` desde un comentario, un evento, la lista de vecinos de un barrio o la bandeja, la ficha aparecía vacía: avatar de marcador de posición, sin foto y un guión en cada estadística. La pantalla pedía las personas *creadas por* quien estás visitando (`getPersonsByCreator`), y esa consulta las reglas no la pueden autorizar para nadie salvo su creador — `createdBy ==` no demuestra nada sobre `isPublic` ni sobre quien pregunta, así que se rechaza entera, tenga o no esa persona una persona a cargo privada. El `permission-denied` resultante tumbaba el `Promise.all` que llevaba también la lectura de la persona y la de los eventos, y la carga moría antes de escribir un solo campo.
  - **La consulta ya no se hace al visitar.** «Mi gente» es una sección que sólo ve su dueño, así que sólo su dueño la pide. `getPersonsByCreator` acepta además un `viewerUid` y, cuando no eres el creador, fija la rama pública (`isPublic == true`) — el mismo patrón que ya usaba su hermana `getPersonByUserId`, para que la próxima persona que llame al servicio no vuelva a pisar la mina. Índice compuesto nuevo: `persons` por `createdBy + isPublic + createdAt`.
  - **Y una lectura denegada ya no puede vaciar la ficha entera.** Las dos lecturas de cabecera pasan por `Promise.allSettled`: cada una alimenta una parte distinta de la tarjeta, así que un rechazo degrada su sección en lugar de abortar la carga.

- **Las tarjetas de fecha y ubicación ya no se comen la pantalla de detalle.** En la app —no en la web— las tarjetas de FECHA y UBICACIÓN se estiraban cada una hasta ocupar la pantalla entera, y todo lo que va debajo (Organizadores, Pueblo, Descripción, Asistentes) quedaba fuera del alcance del scroll: la altura del contenido ya estaba agotada, así que no había forma de llegar hasta ello. La tarjeta declaraba `h-full`; en web `height:100%` contra un padre de altura automática se resuelve como altura de contenido y no se notaba nada, pero en nativo Yoga lo resuelve contra el viewport del `ScrollView`. La igualdad de altura entre las dos tarjetas ya la daba el `items-stretch` de la fila, así que `h-full` era además redundante. Afectaba a **todas** las pantallas de detalle de entidad, no sólo a los eventos.

## v0.23.0 — 2026-08-20

### Added

- **Cualquier comentario ajeno se puede denunciar, y a su autor se le puede bloquear.** Cada comentario que no es tuyo lleva una bandera que abre una hoja con siete motivos (spam, acoso, odio, contenido sexual, violencia, información falsa, otro) y, debajo, *Bloquear a esta persona*. Denunciar no falla nunca — es una escritura directa del cliente a la nueva colección `contentReports/`, con las reglas fijando quién denuncia (tú) y en qué estado nace (`open`, nunca resuelto de antemano). Bloquear es supresión del lado del cliente: los comentarios de esa persona desaparecen de tus pantallas al instante y no se vuelven a cargar, sin que su contenido cambie para nadie más. La lista vive en `users/{uid}/blockedUsers/` y es de lectura **y** escritura exclusivamente de su dueño — una lista legible revelaría quién bloqueó a quién, que es material de acoso por sí mismo.
  - **Ajustes → Personas bloqueadas** lista a quién has bloqueado y permite desbloquear. Un bloqueo que no se puede deshacer no es un bloqueo.
  - **Administración → Denuncias** es la bandeja de moderación: las denuncias abiertas del pueblo activo, con *Descartar* y *Marcar como revisada*. Sólo leen y resuelven los administradores del pueblo (o de la app); ni quien denuncia ni la persona denunciada pueden leer la denuncia, así que nadie averigua quién le señaló.
  - Esto es requisito de ambas tiendas para contenido generado por personas usuarias: el cuestionario de clasificación de contenido de Google Play lo pregunta y la guideline 1.2 de la App Store exige denuncia **y** bloqueo. Ver [docs/store/](docs/store/).

- **Página pública de eliminación de cuenta** en `/legal/eliminar-cuenta`: cómo borrar tu cuenta desde la app o por correo, qué se elimina y qué se conserva. El formulario de Data safety de Google Play exige una URL web de eliminación, separada de la ruta dentro de la app (que sigue estando en Ajustes → Eliminar cuenta).

### Changed

- `ITSAppUsesNonExemptEncryption: false` en `app.config.ts`: la app sólo usa HTTPS/TLS estándar, así que declararlo una vez evita que App Store Connect pregunte por cumplimiento de exportación en cada build.

### Removed

- **Sixteen spent one-off backfill scripts are deleted.** They predate the registry, have run in every env, and can never meaningfully run again — `migrate-to-flat.mjs` in particular targets a collection layout that no longer exists. Git keeps the history (*Delete > deprecate*), and `pnpm backfills:lint` drops from 22 warnings to 6, so the coverage check reads as signal rather than the wall of noise that trains people to skip it — the same inattention that let `autoApply: []` sit unnoticed on every backfill.
  - **Six are deliberately kept**, because they are not dead: five are the **backfill-of-record** that [denormalized-read-models.md](docs/architecture/denormalized-read-models.md) names for a live read model — the documented way to repopulate `municipalityPeople`, entity comment counts, readcount, org member count or place burial count should one ever drift — and `backfill-entity-contributors` is wired to a `package.json` script. Deleting those would delete the answer to "how do I rebuild this?", not just the code.
  - **Fixed a broken link that made the case.** `denormalized-read-models.md` pointed at `scripts/backfill-user-displayname.mjs`, which no longer exists — a script deleted at some point without updating the doc that named it, leaving that read model with no documented repopulation path at all. AGENTS.md now states the rule directly: retire one of the six only after its entry in that doc goes too.

### Fixed

- **Turning in-app sign-ups off no longer leaves an orphaned roster behind.** The *Inscripciones por la app* toggle was freely flippable on an event that already had sign-ups — unlike *inscripción por grupos*, which freezes the moment anyone books — and nothing happened to the registrations. The result contradicted itself in the app: the detail screen announced that the event takes no sign-ups through the app while still listing the people who had made one, those people kept the event under *Mis inscripciones* and the "Apuntado" ribbon in the feed, and they **lost the ability to cancel** — the self-cancel button lives on the sign-up FAB, which the same flag hides, so only an organizer could still remove them.
  - **Saving with the toggle off now names what it destroys.** An event with sign-ups asks for confirmation before the save goes through — *"Se eliminarán las 3 inscripciones que ya hay y se avisará a quienes se apuntaron"* — rather than doing it silently. The toggle itself stays free: "las inscripciones se hacen en el ayuntamiento" is the case the whole feature exists for, and forcing the organizer to delete ten people by hand first would make it unusable exactly there.
  - **The sweep is server-side.** `onEventUpdated` deletes every registration, its organizer-only private doc and any unconsumed group-invite link, and writes each affected account one `signups_disabled` notification — so it is true whichever client flipped the flag, and a half-run cannot be left behind by an organizer who navigates away. The notification id is derived from the event, so Eventarc's at-least-once delivery cannot produce a second one. An event whose sign-ups were *already* off is untouched, which is what keeps an organizer's `addWalkInRegistration` records (deliberately still allowed there) from being deleted by a later unrelated edit.
  - **Waitlist promotion stands down on such an event.** Deleting a confirmed seat normally promotes the next in line; on an event that no longer takes app sign-ups it would email someone a place that the same sweep is removing, so the promoter now skips it and only the counters are recomputed.
  - **Migration:** four events in production were already in this state, holding 17 registrations between them — run `pnpm backfills:run --id=signups-disabled-registration-sweep --env=<env> --apply` per env (or Actions → "Run Backfill"). It does what the trigger now does at the moment of the flip: deletes the stranded registrations and notifies the people who were on them. `phase: none` (it gates no deploy) and never auto-applied.

## v0.22.0 — 2026-08-20

### Changed

- **A promotion no longer stops to have its migrations run by hand.** Shipping v0.21.0 took twelve manual "Run Backfill" dispatches, two cancelled deploys and a 30-minute hang, for six migrations that were all purely additive. Every piece needed to avoid that already existed — `autoApply` was built, validated and wired into the deploy — but it sat **after** the conformance gate, which reads exactly the documents auto-apply was about to write. The gate failed first and the deploy died before reaching it, so the mechanism was unreachable for every schema change it was designed to absorb, and every registered backfill had quietly settled on `autoApply: []`. Auto-apply now runs **first, before both gates**, and the six 0.21.0 backfills opt in. The ordering is locked by a test, because it is invisible in a diff and fatal to get wrong.
  - **`dependsOn` declares run order between backfills.** Auto-apply previously ran in `meta.id` alphabetical order, which is not a safe order for a **projection**: patching a source collection fires the currently-deployed trigger, which rewrites projected rows with a full `set()` predating the new field — silently undoing projection work already done. `registration-person-denorm` now declares the source backfills it must follow instead of relying on where its name happens to sort. Cycles throw rather than resolving arbitrarily, and ties keep their incoming order so an unrelated rename cannot reshuffle a run.
  - **`autoApply` is now the documented default** for an additive, idempotent `pre-deploy` backfill, with `pnpm backfills:lint` warning (never failing) when one leaves it empty. Five older backfills are flagged and left alone — they have already run everywhere.
- **The conformance gate fails fast instead of timing out.** It descended into a municipality's subcollections when the parent doc failed to parse, on the reasoning that a drifted parent shouldn't hide drift below it. The cost landed exactly when the gate was doing its job: a missing required field makes all ~6k INE reference docs throw, so each got four sequential subcollection reads — ~24k round trips, turning a 6-second gate into a 30-minute job timeout reported as a timeout rather than "N nonconforming docs". A parent that fails to parse is now the finding, and is not descended into.
- **The release tag is created by CI.** `vX.Y.Z` was a manual step in the release checklist, so it was silently skipped whenever whoever cut the release could not push tag refs — `v0.21.0` shipped untagged for exactly that reason. A `tag` job in `deploy-prod.yml` now tags the commit once the prod deploy is green, reading the version from the mirrored `package.json`. It is idempotent, so a re-run after a transient push failure succeeds rather than tripping on an existing tag, and `contents: write` is scoped to that job alone — dev and beta keep a read-only token. It cannot retro-tag a release older than itself, since a re-run uses the workflow file as it stood at that commit; `v0.21.0` was tagged by hand as the one-off.

## v0.21.0 — 2026-08-19

### Added

- **Events can require people to sign up in groups — parejas, tríos, grupos de cuatro.** A new *Inscripción por grupos* setting on the event form (default *Individual*, so nothing changes for existing events) makes sign-up seat people together: a group is confirmed as a whole or waits as a whole, so a pareja can never be split across the capacity boundary with one in and one on the waitlist. The size is frozen the moment anyone signs up — seats already booked were seated against the old value, and neither the client nor the rules can re-seat them.
  - **A seat can be filled by a persona you have a cargo, or by someone else through a link.** Building a group, each seat is either one of your own personas or an *open seat*: you book it, hold it, and get a single-use link to send whoever is coming with you. Your own persona starts ticked — you are in your own group by definition — and an open seat is a tickable row reading *"Inscribirte con otro usuario de la app"*, so "me and a friend" is two ticks rather than a tick and a counter. Once booked, the sheet stays on your group, where each unclaimed seat carries its own *Enviar enlace* row; the OS share sheet no longer fires unasked the instant the booking lands, which hijacked the confirmation and left no way back to the other seats' links. They open it, sign in, answer the event's own sign-up questions for themselves, and the seat becomes their registration. Nothing about the seat changes when they claim it — it was already booked and already counted, so a claim is a reassignment, not a new sign-up. That is why there is no pending state, no expiry, and no third registration status anywhere: a seat nobody claims just means you brought a guest whose name the organizer doesn't know.
  - **The link is a secret and is stored like one.** Claim tokens live in a new `events/{id}/seatTokens/{token}` subcollection — the document id *is* the token — readable only by the group owner (to re-share it) and the event's organizers, and writable only by Cloud Functions. It is deliberately not on the registration doc, which the whole pueblo can read.
  - **If a guest drops out, their seat reopens instead of collapsing your booking.** Cancelling a claimed seat winds it back to an open seat with a fresh link and notifies you; cancelling as the group's owner — or an organizer removing anyone — takes the whole group, because a half-group is a state sign-up itself refuses to create.
  - **Waitlist promotion now moves whole groups.** When a seat frees up, the promoter takes the lowest-position group that *fits* the freed space, never half of one. On an individual event this is exactly the old behaviour: the single lowest-position waitlisted registration.
  - **The roster shows unclaimed seats as "Plaza libre"** and the organizer's export gains a *Grupo* column numbering the groups 1..N (only on events that have them — no empty column on an ordinary roster).

### Changed

- **"Mis inscripciones" splits into *Próximos* and *Pasados*.** The screen listed every event you had ever signed up for in whatever order the registrations came back, so the thing you actually open it for — what you have coming up — sat somewhere in the middle of last year's fiestas. It now carries the same sliding segmented toggle the feed uses: *Próximos* opens first and reads soonest-first, *Pasados* reads most-recent-first, so the top row of either tab is the one nearest to today. An event that is running today (or a multi-day one still in progress) stays under *Próximos* — the split keys off the same day boundary the feed and the expiry scheduler use, not off the raw start timestamp.

- **Cancelling a registration goes through a Cloud Function; clients can no longer delete one directly.** `firestore.rules` now denies deletes on `events/{id}/registrations/{rid}` outright. A group is atomic, so removing one seat has to take the whole group or leave it whole — rules can neither read the sibling seats nor require that the companion deletes accompany the one in front of them, so no client delete could be trusted. Ordinary individual cancellation moved with it rather than leaving a second, weaker path open. Who may cancel is unchanged: the person holding the seat, or the event's organizers.
  - **Migration:** `events.signupGroupSize` and `registrations.groupId` / `.groupOwnerId` / `.isOpenSeat` are new fields — run `pnpm backfills:run --id=event-group-signup --env=<env> --apply` per env (or Actions → "Run Backfill"). It is `pre-deploy` and purely additive: every existing event becomes individual sign-up (`1`) and every existing registration ungrouped.

- **The event form's first step now asks who is behind the event, and its third one stopped lecturing.** *Organizadores* and *Grupos involucrados* moved from *Detalles* into *Lo básico*, next to the title and the description — who is organising is part of what the event *is*, not a setting, and burying the two "añadir" rows three steps in meant most events shipped with only their creator on them. In exchange, *Detalles* lost the paragraphs it carried under *Inscripciones por la app*, *Inscripción por grupos* and *Lista de asistentes visible*: the same wording is now one tap away behind an "ⓘ" next to each label (new `InfoTooltip` primitive), so the step reads as the short list of decisions it is instead of three screens of prose. Only the *"ya hay gente apuntada"* note stays inline — it explains why the control in front of you is greyed out, so it has to be visible.

- **The event form reads the same way down its whole length.** *Detalles* mixed two layouts — text fields stacked their label above the control, switches put theirs on the left with the switch right-aligned — so nothing lined up. Every setting now uses the field layout: label (with its "ⓘ") on its own line, control underneath. In *Lo básico* the cover picker moved up directly under the title, since the image is part of how you picture the event, not an afterthought below the description.
- **"Inscripción por grupos" is a yes/no first and a size second.** It used to be a single row of 1 / 2 / 3 / 4 where "1" meant *Individual* — so ordinary individual sign-up, the common case, looked like a setting you had to understand before you could skip it. Now a switch asks whether the event takes group sign-ups at all; only when it's on does *Personas por grupo* appear, offering 2, 3 or 4. Turning it off returns the event to individual sign-up. Nothing changed in the data: `signupGroupSize` is still `1` for individual, and it stays frozen once anyone has signed up (the switch and the sizes both grey out together).
- **"Lista de asistentes visible" now hides with the rest of the sign-up settings.** It governs who can see the sign-up list, so on an event that takes no sign-ups through the app there is no list for it to be about. It joins aforo, teléfono, pago and inscripción por grupos behind the *Inscripciones por la app* toggle, keeping its value so re-enabling sign-ups restores it.

### Added
- **Events can take no sign-ups at all.** The event form has a new *Inscripciones por la app* toggle (on by default). Turned off, the event's detail screen drops the sign-up button entirely and shows an *Inscripciones* line in its place — either the organizer's own note (*"Inscripciones en el ayuntamiento"*, a phone number, a URL) or a default *"Este evento no requiere inscripción por la app"*. This is the common village case the app had no way to express: a verbena or a procesión that anyone simply turns up to, and the event whose list is kept on paper somewhere else. Until now every published event begged to be signed up for, which made the button meaningless on roughly half of them.
  - Turning it off also hides what only exists to serve sign-ups: aforo máximo, teléfono obligatorio, pago, inscripción por grupos, and the whole *Preguntas* step of the form (its answers are collected at sign-up time, so they would be unreachable). The hidden settings keep their values, so re-enabling sign-ups restores the event's previous configuration.
  - The flag is enforced server-side, not just hidden: registrations are created only by the `registerToEvent` callable (direct client writes are already denied), and it now refuses with `failed-precondition`. The organizer-side `addWalkInRegistration` is deliberately left open, so an organizer can still record who actually turned up.
  - **Migration:** `events.signupEnabled` and `events.signupInfo` are required — run `pnpm backfills:run --id=event-signup-enabled --env=<env> --apply` per env (or Actions → "Run Backfill"). It is `pre-deploy`: `firestore.rules` requires both keys on an event create. Existing events get `true` / `null`, i.e. exactly today's behaviour.

- **Events you are signed up for are marked in the feed.** An event card now carries a diagonal ribbon across the top-left corner of its image when the viewer has registrations on it — "Apuntado", or "Apuntados ×3" when they signed up personas too. Waitlisted registrations take the secondary olive instead of the accent terracotta and read "En espera", so a queued place can't be mistaken for a confirmed one. When a household is split across both, the band splits with it: two lines, terracotta over olive, each carrying its own count, because a single merged total would leave the reader unable to tell who is in and who is waiting.
  - The ribbon's geometry is fixed for every state (`CornerRibbon`). Growing the corner to fit a longer label would give neighbouring cards differently-sized triangles and make a scrolling column look broken, so the band is constant and the labels are sized to the ~116px chord it exposes.
  - The count is people, not accounts, and it doesn't distinguish "you and two children" from "two children without you" — the detail screen is where you see who is on the list.
  - **Reads:** one collection-group query per session, held in a context (`MyRegistrationsProvider`) that cards look up synchronously — never a query per card. `getUserRegistrationTallies` caps it at the 100 most recent registrations, since they accumulate for the life of the account while the feed only ever shows upcoming events. No new index (the `userId + registeredAt` collection-group index already existed), no trigger, no backfill.
- **A lugar can carry its exact spot on the map.** Places (cementerios, iglesias, ermitas, plazas, ayuntamientos) gained an optional pin: the place form now has the same full-screen location picker the event form uses — search by address, "usar mi ubicación", confirm — and the place's detail screen shows the resulting map above its description, framed tighter than the village map since a place is a building or a square rather than a whole pueblo. Tapping it offers directions in Google Maps, exactly like the village map does. The pin is genuinely optional: a village knows its ermita long before anyone bothers to locate it, so an unpinned place stays creatable, reads normally, and simply shows no map. It can also be removed again from the edit form.
  - Like the village's location, the picked spot stores its *name* (`places.locationLabel`) next to the coordinate, so every surface shows "Camino de la Ermita, Abadía" without a geocoding round-trip and nothing ever renders a raw lat/lng at the user. A name can't outlive its pin — clearing the location clears both, enforced in `buildPlaceData` and in `firestore.rules`.
  - The event form's location picker was generic already, so it moved from `EventLocationField` to `LocationField` and grew an optional clear affordance (used by places, not by events, where a location is mandatory). The village map + tap-for-directions block became a shared `LocationMap` component now used by both the village home and the place detail screen.
  - **Migration:** `places.coordinates` and `places.locationLabel` are required (nullable) — run `pnpm backfills:run --id=place-location --env=<env> --apply` per env (or Actions → "Run Backfill"). It is `pre-deploy`: the strict place converter cannot read a doc that predates the fields. Existing places get `null` on both, i.e. "not pinned yet".
- **Store release pipeline (Google Play first, App Store wired).** A manual `mobile-release` workflow builds the store binaries on EAS and submits them, with the Play track chosen at dispatch time: `internal` (fast smoke test), `closed` (the track Google's 12-testers-for-14-days requirement runs on), or `production`. All three submit the *same* `production` build — package `com.cultuvilla.app`, prod Firebase — because Play scopes that testing requirement to a package name, so a `com.cultuvilla.app.beta` build would earn nothing toward releasing the real one. Publishing never happens as a side effect of a merge. The `production` EAS profile now emits an app bundle (Play rejects APKs for new apps) and reads its Firebase config from the EAS `production` environment, since `app.config.ts` is evaluated on the build server where neither `.env` nor GitHub vars exist. The external, account-side steps — developer registration, the Play service account, the store listing copy, the data-safety answers, and the Android OAuth client that Google Sign-In needs for Play-signed builds — are written up in [docs/plans/ongoing/store-release.md](docs/plans/ongoing/store-release.md).
- **The prod deep-link association files are covered by tests.** `apps/mobile/public/.well-known/prod/` now has to keep naming the same app the release pipeline submits to — same package as the Play submit profiles, a real 32-byte app signing fingerprint rather than a placeholder, and an Apple Team ID paired with the matching bundle id. Drift there is what makes a shared `https://cultuvilla.es/event/…` link quietly open the browser instead of the app, with no error message anywhere to explain it.

### Fixed

- **Editing someone else's event no longer makes you one of its organizers.** A village admin fixing an event they didn't create — a case `canEdit` explicitly allows — who opened *Añadir persona* and pressed *Confirmar* was silently added to `organizerUserIds`, even having selected nobody: the picker force-inserts its `lockedUserId`, and the event form handed it the current user in edit mode as well as create. The sheet made it worse by showing your own row greyed and tagged *"Organizador"* when you weren't one, and the resulting entry has no ✕, so it couldn't be undone from the form. It was never a privilege escalation — admins may already edit — but it misattributed the event publicly and left edit/delete rights (`organizerUserIds` is its own clause in the event rules) that outlived the admin role. `apps/mobile/app/news/new.tsx` already got this right; the event form now matches it.

- **Guardar is the last thing in the lugar edit form.** The contributors picker ("personas que digitalizaron esto" / "grupos involucrados") rendered *below* the save button, so the form appeared to end before two of its fields did. It now sits inside the form, above the button, matching every other entity form (cartel, organización, barrio, and the Stepper-driven event/noticia flows already put their primary action last).
- **The collaborator picker lists the village again.** Adding co-organizers to an event (or contributors to a lugar/cartel, writers to a noticia) opened an empty sheet in villages where any member had marked their persona private. `getPersonByUserId` queried `persons` on `userId` alone, and that read rule is evaluated per matched document — so a single private persona made the query fail outright, and because the picker resolved every member's avatar in one `Promise.all`, that one denial emptied the entire list. The lookup now pins the rule's public branch for anyone but the caller themselves (who still sees their own private persona), and the picker resolves each member independently so a failure costs one avatar rather than the whole sheet. Same denial, same shape as the comment-author fix below.
  - The other unguarded callers are fixed too: a third-party profile screen (`/user/{uid}`) no longer hangs on its spinner, and the Solicitudes inbox no longer drops every requester's name because one of them is private.
  - **Index:** new `persons` composite on `userId + isPublic` (`firestore.indexes.json`), deployed with the merge. No data migration.
- **Commenters keep their name instead of collapsing to "Usuario".** Author names were resolved for every uid on screen in a single `Promise.all`, so one failed lookup rejected the whole batch and *every* comment in the thread fell back to the anonymous label — with no retry. The two sources now fail independently and per author: `persons` (a query whose read rule is evaluated per matched document, so a single private persona denies it for that viewer) supplies the freshest name and the avatar, and the world-readable `users/{uid}.displayName` projection is the dependable fallback. A person whose name fields are all blank no longer wins over that projection (it used to render an empty name), and a comment from a deleted account is now labelled "Usuario eliminado" like everywhere else. While a name is still in flight the row shows a placeholder bar rather than flashing "Usuario" and then correcting itself.
### Changed

- **Locations are shown by name, never by coordinates.** A location picked with the "usar mi ubicación" button used to fall back to rendering — and *storing* — the raw pair (`40.28911, -5.98762`) as the location's name, which told the user nothing and stuck to the event forever. Reverse geocoding now runs server-side (new `reverseGeocode` callable, same Google key and response mapping as `geocodeSearch`) instead of through `expo-location`'s device geocoder, which is native-only and therefore *always* failed on the web build — the reason coordinate-named events existed at all. When no address resolves, the picker leaves the field empty and the event form falls back to the village name; a coordinate string is never persisted as a name again.
  - The village's location now stores its name too, in a new `municipalities.locationLabel`, and the village screen captions its map with it. Previously only the coordinate was kept, so the admin editor had nothing to show but the numbers when reopened.
  - **Migration:** `municipalities.locationLabel` is required (nullable) — run `pnpm backfills:run --id=municipality-location-label --env=<env> --apply` per env (or Actions → "Run Backfill"). Pre-existing villages get `null`: their coordinate was picked before any name was captured, so the map simply shows without a caption until an organizer re-picks the spot.
- **The attendee list of an event is now visible to the whole pueblo, not just the organizer.** Anyone who has joined the event's village sees who has signed up — name, photo and the moment they signed up, confirmed and waitlist alike. Seeing who is going is what drives sign-ups in a village, and a visible queue is also the organizer's best answer to "did you let someone jump the list?". Editing stays exactly where it was: only the organizer set, village admins and app admins can mark paid, check in, call, export or remove anyone. Cancelling your own sign-up is still yours.
  - **Organizers can turn it off per event** with a new *Lista de asistentes visible* toggle in the event form (on by default). Off means the roster is organizer-only, as before.
  - **Not public — village-scoped.** A roster names real people, so it is readable by members of that pueblo, never by the open web. This also *tightens* what shipped before: `events/{id}/registrations/{rid}` was `allow read: if true` in `firestore.rules`, so any client — signed out included — could already dump any event's attendee list; the organizer-only roster was a UI gate, not a security one. A signed-out visitor can no longer read registrations at all.
  - **A private persona is counted but not named.** A dependent persona whose creator marked it private (typically a child) shows as *Perfil privado* to everyone but an organizer. The person doc behind it is already denied to other villagers; naming it on the roster would republish exactly what that setting hides.
  - **Contact details and form answers did not move.** The phone and every custom sign-up answer stay in the organizer-only `registrationPrivate` doc, and the read-only roster never even fetches it. Payment and check-in state are hidden in the UI rather than removed from the registration doc — a UI courtesy, not a security boundary.
  - **The roster no longer costs a read per attendee.** `photoURL`, `personUserId` and `isPersonPublic` are denormalized onto each registration at sign-up. The old `getPerson`-per-row fan-out was paid by one organizer; on a village-visible roster every viewer would pay it on every open. These are a point-in-time copy — a later photo change does not rewrite past registrations.
  - **Migration:** two registered backfills, per env — `pnpm backfills:run --id=registration-person-denorm --env=<env> --apply` and `pnpm backfills:run --id=event-attendees-visibility --env=<env> --apply` (or Actions → "Run Backfill"). Both are `pre-deploy`. The first is the load-bearing one: until it runs, existing registrations default `isPersonPublic` to `true`, which would show a private persona's name to fellow villagers.
- The Android manifest no longer requests camera, microphone, background location, or legacy external storage. `expo-location` and `expo-image-picker` pull those in by default; no screen uses them, and each one would otherwise have to be justified in the Play data-safety form (background location additionally requires a written declaration and a video review).

## v0.20.0 — 2026-08-18

### Added

- **Sign-up questions get their own step at the end of the event form, built like the census.** The question list moved out of *Detalles* (where it sat under the telephone/payment toggles and grew to ten stacked rows) into a final *Preguntas* step of the event stepper. It now uses the same forms-builder presentation as the village census builder: numbered question cards, one expanded at a time, a bottom sheet for the question type, and the shared options editor. The card chrome (`QuestionCardShell`), the type sheet (`TypeSheet`) and `OptionsEditor` live in `components/feature/questions/` and are shared by both builders — the census builder was refactored onto them in the same change, so the two screens can't drift apart again. Locked questions (an event that already has sign-ups) now also refuse reordering, not just removal and retyping, since the additive-only rule compares the list by position.

- **The attendee roster shows when each person signed up.** Every registration already stored `registeredAt`; the organizer roster on the event detail screen now renders it under each name, so "who was first" is answerable without exporting anything. The roster is also ordered by that field instead of by `position` — `position` is derived from the registration count at write time, so a cancellation frees a number that a later sign-up reuses and waitlist promotion never renumbers, which made the displayed order drift from the real sign-up order. No schema change and no backfill: the field has always been written by `registerToEvent`.
- **Export an event's attendee list to Excel or CSV.** The organizer-only roster on an event now has a download control that produces the full list — confirmed and waitlisted — as a branded `.xlsx` (default) or a plain `.csv`. The workbook carries the Cultuvilla logo, a title/date header, a frozen filterable header row, real date cells (sortable in Excel, not text), banded rows, and a confirmed/waitlist/total tally. Rows are numbered by the sheet (not by the registration's stored `position`, which a cancellation can hand to a later sign-up), and columns adapt to the event: teléfono only when the event collected phone numbers, pagado only when it requires payment. The CSV is UTF-8-BOM + semicolon-delimited so Spanish Excel opens it with accents and columns intact. The event's custom sign-up questions come along as trailing columns, one per question, typed from the question spec so a number sorts as a number and a yes/no reads as Sí/No — the answers were already fetched to render the roster, so no extra reads. Columns are keyed by the question's stable id, so relabeling a question keeps the answers collected under it, and repeated labels are disambiguated rather than printed twice. Web-only for now — saving a file on iOS/Android needs the native share/file-system modules the app does not ship yet.

- **Confirmation email when you sign up for an event.** Signing up now sends a branded email with the event flyer, title, date, place and pueblo, the list of personas you registered (each marked confirmed or waitlisted with its queue number), and how full the event is — "3 de 50 plazas ocupadas", or a headcount when the event is uncapped. One email per signup, not one per persona. A waitlisted attendee who is later promoted gets the same email with a "se ha liberado una plaza" lead.
  - Sent through Resend on the existing `hola@acceso.cultuvilla.es` sender, reusing the `RESEND_API_KEY` secret the auth emails already use — no new provider, credential or domain.
  - Best-effort by design: the send happens *after* the registration transaction commits (a send inside it would repeat on every Firestore retry), and any failure is logged and swallowed. A bounced email never costs you your place, and the in-app notification remains the durable record.
  - Walk-in attendees added by an organizer get no email — they have no account and no address on file.
  - The flyer is a remote image, which Outlook and Apple Mail block by default; every fact in the email is repeated as text, so it reads completely with images off.

- **The signup email reaches people who signed up before it existed.** A one-off registered job (`existing-signup-emails`) walks every published event that has not finished yet, groups its existing registrations per user, and sends each of them the same branded email the live sign-up path now sends — reframed as a reminder ("Recordatorio de inscripción: …", lead "Te recordamos que estás apuntado a este evento") rather than a confirmation, since the sign-up itself may be weeks old. One email per user per event, listing all the personas they registered; waitlisted personas keep their queue position. Events already over are skipped, walk-ins and users with no address on file are skipped.
  - Emails cannot be unsent, so the job is dry-run by default (it prints every recipient it would mail) and records each successful send at `_admin/emailSends/existing-signup-emails/{eventId}__{userId}`. A re-run after a crash resumes without mailing anyone twice, and it is never auto-applied by a deploy.
  - The email template moved from `functions/src/events/` to `@cultuvilla/shared/email` so the Cloud Function and the script render the identical mail from one source; `eventWebUrl` moved with it.
  - **Migration:** per env, `pnpm backfills:run --id=existing-signup-emails --env=<env> --confirm --apply` (or Actions → "Run Backfill"). The runner needs `roles/secretmanager.secretAccessor` on that project's `RESEND_API_KEY`, which is how the script reads the sending key.

- **Custom sign-up questions on an event.** The creator can define up to 10 typed
  questions (text, number, date, single-choice, yes/no) in the event form, and
  every person signed up answers them — a DNI per runner, a t-shirt size per
  attendee. Questions are per-attendee, unlike the event's single shared phone,
  so ticking three personas asks three times. Answers are PII, so they never
  touch the world-readable registration doc: they land in the organizer-gated
  `events/{id}/registrationPrivate/{regId}` alongside the phone, and the
  organizer sees them under each name in the attendee roster.

  The `registrationContacts` subcollection is renamed `registrationPrivate` and
  now carries `{ name, phone, answers }` — it was already keyed per
  registration, so this merges two gated docs into the one the name now
  describes. Validation lives in a single shared validator
  (`validateSignupAnswers`) run both by the sign-up sheet and, authoritatively,
  inside the `registerToEvent` / `addWalkInRegistration` transactions.

  Once an event has sign-ups its question list is additive-only — existing
  questions can be relabelled but not removed or retyped, since the collected
  answers are keyed by their ids. Firestore rules enforce the size half of that
  (rules have no loops); the edit form enforces the rest.

  **Migration:** run in this order, per env —
  `pnpm backfills:run --id=event-signup-fields --env=<env> --confirm --apply` and
  `pnpm backfills:run --id=registration-private-merge --env=<env> --confirm --apply`
  (both `pre-deploy`: the promotion blocks until they have run), then **after**
  the deploy
  `pnpm backfills:run --id=registration-contacts-drop --env=<env> --confirm --apply`,
  which re-copies anything the old function wrote during the deploy window and
  then deletes `registrationContacts`. Applied to dev; the post-deploy drop is
  deliberately still pending there until this ships.

### Changed

- **The mobile app is pinned to its own EAS account and project** (`cultuvilla.app` / `53188e5f…`) instead of resolving from `EAS_PROJECT_ID`. An env var is machine-global, and the same machines check out `ordago-apps`, whose Expo config owns `ordago-apps` — a stray export would have silently built one repo into the other's EAS project. `owner` + `projectId` as literals make the routing per-repo by construction, and a new test asserts the env indirection cannot come back.
- The three `apple-app-site-association` files now carry the real Apple Team ID (`78RB67NT38`) in place of `REPLACE_TEAM_ID`. The Android `assetlinks.json` fingerprints stay placeholders — they need Google's Play App Signing certificate, which does not exist until the first Play upload. Deep links remain web-only until the apps are actually released.
- **A production error now says what failed, where, and on which build.** Prod client errors arrived with an unusable payload: both global capture paths passed an empty context, so `route`, `appVersion` and `operation_id` — all long since allowlisted — were always absent, and `error.code` was never captured at all. Nine Firestore denials were logged with no way to tell which query produced them. Three changes: the adapter now fills in `code`, `route` and `appVersion` on every capture (an explicit context value still wins); `withFirestoreErrorLog` reports its call-site label in production instead of being a `__DEV__`-only `console.warn`; and `logClientError` keeps `error.code`, `operation` and `surface`. The label matters specifically because a Firestore permission denial deliberately carries no collection or document path — naming the rule that refused would itself leak it — so every such error is identical by construction and only the call site can identify it. The error boundary's marker moved from `route: 'boundary'` to `surface: 'boundary'`, which had been overwriting the very screen that crashed.

### Fixed

- **The "¿A quién quieres apuntar?" sheet now grows with its content.** Its persona list was capped at a fixed 320px scroll box regardless of screen size, so an event with custom sign-up questions (asked once per ticked persona) left the user scrolling a tiny window on a tall phone. The card now sizes to its content up to 90% of the viewport, and the list takes whatever room is left. A rejected **Confirmar** also scrolls the first persona with a missing required answer into view, instead of leaving the error off-screen below the fold.
- **Signing in with the wrong email is no longer a one-way door.** Verifying an OTP code creates the Firebase Auth account for whatever address was typed, and `AuthGate` routes an account with no `personId` to `/(onboarding)/complete-profile` and to no other screen — a screen that had no back button and no sign-out. The only way forward was to finish creating the account you were trying not to create. Three changes: the OTP code step now offers **"Usar otro correo"** so a typo can be corrected before it becomes an account; the onboarding screen carries a sign-out action; and taking that exit deletes the Auth user when it has no profile doc yet (that account was created by this very sign-in, so leaving it behind would squat on the address and keep intercepting the real owner's codes). Falls back to a plain sign-out if the delete is refused.
- The attendee roster's "Editar" toggle no longer appears on an event with no sign-ups — there was nothing to edit, so the toggle only shows once at least one person (confirmed or waitlisted) is on the list.

- **Three latent failures on a weak connection.** All three predate v0.19.0 and are unrelated to that release; a bad connection is what made them visible.
  - **Signup could strand a real account.** `verifyAuthOtpCode` deletes the OTP inside the transaction that validates it, then creates the user and mints a custom token — so if `signInWithCustomToken` died on the network afterwards, the code was spent and the account existed, but the user saw an error. (Signing in again worked, which is what made it look like a phantom bug.) The minted token is now held in memory and reused by the retry instead of demanding a fresh code; it is discarded when the server rejects it, and on sign-out.
  - **Auth and Storage failures showed raw SDK strings.** `classifyCallableError` only knew HttpsError codes, so `auth/network-request-failed` fell through to "Algo ha fallado" — and the login screen bypassed the classifier entirely, rendering `Firebase: Error (auth/network-request-failed).` at the user. Namespaced `auth/*` and `storage/*` codes are now classified, and the auth screens route through a shared helper that prefers classified copy, keeps server-authored Spanish (e.g. "Código incorrecto o caducado."), and never renders a developer string.
  - **A failed event-cover upload created duplicate events.** Creating an event and uploading its cover are two round-trips; when the upload failed, the event already existed but the form stayed open, and pressing the button again ran `createEvent` a second time — one duplicate per retry. The new event's id is now held for the life of the form, so a retry finishes that event.

- `formatDate` now takes an optional IANA time zone. Cloud Functions run in UTC, so any date they rendered was one or two hours off the Spanish wall clock; the registration email passes `Europe/Madrid` (now exported as `EVENT_TZ`) explicitly. Client callers are unaffected — the device zone is already correct, and the parameter is optional.

## v0.19.0 — 2026-08-15

### Changed

- **Eventos leads again, on both surfaces.** v0.18.0 put Artículos first in the Explore feed and the village home, on the reasoning that the pueblos had little event activity. Reverted before it reached production: Eventos is the landing tab and the first village-home section again. The feed order still derives from the single `TABS` tuple introduced in v0.18.0, so this was a one-line change there plus moving one `<Section>`.

## v0.18.0 — 2026-08-15

### Security
- Locked the document fields that Firestore rules derive authority from. A guardrail audit found five places where a rule granted access based on a field the client could rewrite; no UI offered these writes, so only the rules could catch them. Closed: a person doc could point `userId` at another account and hijack that account's `displayName` via `syncPersonDenormalization`; an approved peña could flip `type` to `ayuntamiento` (a per-village singleton) or move itself to another pueblo; a village admin could self-appoint as `community.organizerId`, which `changeVillageMemberRole` then refuses to demote (an irreversible admin lock), rewrite the INE identity fields, or deactivate the community; a comment could carry a foreign `municipalityId` and so sit outside the reach of the admins who moderate its entity; a waitlisted attendee could self-promote to `confirmed` past `maxAttendees`; and the creator of a place/barrio/cartel could reassign `proposedBy` (plus move a cartel between villages).

### Added
- **`config/appVersion` is now writable from CI** (Actions → **Set App Version**), the last release step that required credentials nobody holds locally — it is a Firestore write, not a code deploy or a data migration. Keyless via the same WIF service account, dry-run by default. With this, a release can be cut end-to-end from a session with no credentials: every other step is a PR merge that auto-deploys.

- **Backfill registry + CI endpoint.** Data migrations are now registered, verified, and runnable from CI without local credentials.
  - A backfill script exports `meta` (`id`, `kind`, `phase`, `envs`, `idempotent`, `owner`, `autoApply`) and `run(ctx)`, and is discovered automatically (`pnpm backfills:list`). Discovery is sentinel-gated behind an `isMain()` guard so listing the registry can never *run* a backfill.
  - A successful `--apply` records `_admin/backfills/markers/{id}.{env}`. That marker — not a CHANGELOG line — is now the source of truth for "has this migration run in this env". `_admin/**` is denied to every client in `firestore.rules`.
  - **The deploy enforces it.** `develop → beta` and `beta → main` now run `pnpm backfills:verify` against the target env before any `firebase deploy`, alongside the existing conformance gate: a `pre-deploy` backfill with no marker fails the promotion instead of shipping converters that cannot read that env's data. `post-deploy` backfills warn rather than block (blocking would deadlock — they cannot run until the deploy has happened). Backfills opting into `autoApply` are applied automatically just before the gate.
  - **New workflow `Run Backfill`** (Actions → Run Backfill) runs any registered backfill against dev/beta/prod. Dry-run by default, always dry-runs before applying, serialized per env, and authenticated keylessly via the same Workload Identity Federation service account the deploy uses — so no service-account keys are stored and a migration can be driven by someone (or something) holding no credentials at all.
  - Three existing scripts are converted as reference (`comment-threading`, `barrio-resident-count`, `municipality-name-lower`); the remaining ~25 legacy scripts are flagged warn-only in CI by `pnpm backfills:lint`.

- Comment replies: reply to a specific comment (one level of nesting), with a "View N replies" toggle and a notification to the parent comment's author.

**Migration:** `pnpm backfills:run --id=comment-threading --env=<env> --confirm --apply` — backfills `comments.parentCommentId`/`replyCount` and `users/*/notifications.entityKind`/`entityId`. Registered `pre-deploy`: the promotion blocks until it has run.

- Privacy switch on a persona a cargo: its creator can mark the profile private, which keeps the name in the pueblo census but denies the persona's card to everyone else (Firestore rules, not just the UI). New personas default to public; an account holder's own persona is always public.

**Migration:** `pnpm backfills:run --id=person-visibility --env=<env> --confirm --apply` — backfills `isPublic: true` on `persons/` and `municipalityPeople/`. Registered `pre-deploy`: the promotion blocks until it has run.

- Pre-deploy **custom-token signing gate** (`scripts/check-custom-token-signing.mjs`, wired into `.github/workflows/deploy-firebase.yml` for every env): asserts the target project's functions runtime service account can actually mint custom tokens, and fails the deploy with the exact remediation command if not. Closes the class of bug in Fixed below, where a project deploys clean and then fails every custom-token sign-in at runtime. Run it ad hoc with `pnpm check:custom-token-signing -- --env dev|beta|prod`.

**Migration:** the gate reads IAM as the WIF deployer service account, which needs `roles/iam.serviceAccountViewer` — added to `scripts/setup-ci-deploy-wif.sh` for new environments, but **existing envs must be granted manually before this reaches them**, or the deploy fails on the new gate step:
`gcloud projects add-iam-policy-binding <project-id> --member="serviceAccount:gha-deployer@<project-id>.iam.gserviceaccount.com" --role="roles/iam.serviceAccountViewer" --condition=None`. Verified already granted on all three envs (`villa-events`, `cultuvilla-beta`, `cultuvilla-prod`) as of this release — no action needed for the 0.18.0 promotion.

### Changed
- **One definition of "may I edit this?"** for all five entity kinds. `useEntityCapabilities().canEdit(creatorId, organizerUserIds?)` is now the single predicate — admin, author, or named organizer — and both the `useEventOrganizer` hook and the hand-rolled check on the article screen are gone. Each kind used to answer the question its own way, and two of them answered it differently from the server.
- The person card (a persona with no account, opened from the village tab) was rebuilt as an encyclopedia entry: the name owns the top of the screen (the nav bar no longer repeats it), then a portrait photo on the left with the facts beside it — **Nacimiento**, **Pueblo**, **Barrio** and **Oficios**, each a muted label with its value underneath. Birthplace, pueblo and barrio are new to this screen: the ids stored on the person are resolved to municipality and barrio names. Oficios is now one comma-separated line instead of a row of rounded chips.
- **Comments got an Instagram-style pass.** The always-on "Enviar" button is gone: the composer is a rounded, accent-outlined capsule (preceded by your own avatar) whose send arrow appears inside the field only once you've typed something. Replying no longer opens a second field: "Responder" focuses the same composer and marks it with a "Respondiendo a X" line above the field, dismissable with an ✕. Comment rows changed shape too — the author's name carries a compact age beside it (`5s`, `3d`, `1sem`) and the body sits on its own line below, with "Ver N respuestas" and "Responder" sharing a single action line underneath. New `pill` variant on the `Input` primitive and `formatCompactRelativeTime` in the shared formatters.
- **Artículos now come before Eventos.** The Explore feed opens on the Artículos tab (Eventos is second), and the village home lists the Artículos section above Eventos — while the pueblos have little event activity, articles are what there is to read. On Explore the order now derives from a single `TABS` array, so the toggle labels, the swipeable pages and the landing tab can no longer drift apart.
- Everyone who lives in a barrio is now listed on its screen, personas with no account included, and tapping one opens their details. The barrio roster reads the `municipalityPeople` projection (which gained a `barrioId`) instead of querying `persons`, so a private persona stays listed by name with an unlinked row — the same behaviour as the pueblo roster — rather than disappearing from the barrio.

**Migration:** `pnpm backfills:run --id=municipality-people-barrio --env=<env> --confirm --apply` — projects `barrioId` onto `municipalityPeople/`. Registered `pre-deploy`: the promotion blocks until it has run.

- Opening a persona from the village tab (roster, barrio, event attendees) now shows their details, never the edit form — even for a persona you manage. The form is reached only from your own profile.
- **Every name credited on a screen now opens that person.** Comment and reply authors (both the avatar and the name), the news byline, and the contributor chips on places and carteles were the last surfaces printing a name you couldn't tap — the same chip was already tappable on events. All of them route through one `ownerRoute` helper, so a credit can no longer lead somewhere different depending on which screen rendered it. An author whose account was deleted stays inert rather than routing to a tombstone uid.
- The persona a cargo visibility switch moved to the first step of the form (Identidad), next to the name, rather than sitting after the biography.
- Org member and event attendee rosters now open the tapped person's profile, like the villager roster does. Their destructive controls (remove from org / remove attendee) and the org promote/demote action moved behind an "Editar" toggle on the section heading, so they are hidden while simply reading a roster.

### Fixed
- **The backfill gate was letting this release through empty.** Three of the release's data migrations were invisible to it: `person-visibility` and `municipality-people-barrio` were written as legacy standalone scripts (hardcoded to dev, no `meta`), and `comment-threading` was registered `phase: 'none'` on the stated grounds that it had "already been applied to every env before the registry existed". Running the conformance check against the live data disproved that — beta had 33 nonconforming docs and prod 340, across exactly those three field sets. So `backfills:verify` reported "all 0 pre-deploy backfills applied" for beta and prod while the promotion would have deployed converters that crash on `persons`, `municipalityPeople`, `comments` and `users/*/notifications`. All three are now registered `pre-deploy`, which is what actually blocks a promotion until the marker exists. The lesson the registry was built for: a marker is evidence, a code comment isn't.
- `scripts/seed-app-version-config.mjs` defaulted `latest` to a **hardcoded `0.1.0`** while `app.config.ts` was at `0.17.0` — running it without `--latest` announced a 16-versions-stale release as newest. It now reads the version from `app.config.ts`, the documented source of truth, via a shared helper that `check-beta-version-bump.mjs` also uses.
- The same script wrote `config/appVersion` whole (`merge: false`), so omitting `--min` silently reset `minSupported` to `0.0.0` — un-walling every client the gate was deliberately blocking. Omitting it now **preserves** the stored value; only an explicit `--min` moves the wall. Harmless while the gate is dormant at `0.0.0`, latent once it isn't.
- It also gained `--dry-run`, so the resolved values can be previewed against the stored doc before writing.
- `scripts/backfill-barrio-resident-count.mjs` ignored its own `--apply` flag and wrote on every invocation — there was no dry run. It now honours `--apply` like every other backfill.
- A **private persona no longer disappears from their own creator's view of the cemetery**. The buried list is read with two queries — the public burials, plus the caller's own — and merged, because Firestore evaluates a read rule per matched document and so rejects a single unfiltered query outright rather than filtering it. The creator now sees their relative among the difuntos, marked with a lock so it's clear the row is theirs alone; private still means invisible to everyone else here, since the cemetery has no function-owned projection to list names from. Adds a `burialPlace.placeId + createdBy` composite index.

- **Village admins can now edit the articles in their pueblo**, not only hide them. [docs/decisions/event-news-ownership-and-single-date.md](docs/decisions/event-news-ownership-and-single-date.md) has always specified one control predicate for every entity — author, named organizer, village admin, app admin — but the news update rule was the one place that left the admins out, so an admin could moderate an article without being able to fix a typo in it. Note this is genuine new authority: unlike hiding, a content edit leaves no `moderationEvents` trail.

- The news edit route (`/news/new?newsId=…`) had no authority check at all — anyone who deep-linked to it got the compose form pre-filled with someone else's article, and only discovered they couldn't save it when the write bounced off the server. It now redirects to the article, like every other entity's edit screen.

- Persona photos are no longer re-cropped on the person card. They are uploaded through a 1:1 cropper, but the card rendered them in a 3:4 box, taking a quarter off the height — centred, so it cut the top of the head and the chin. The box is square now, matching what is stored.

- **You can edit what you created again.** Lugares, barrios y carteles you added yourself offered no ✎ action unless you were a village admin, and opening the edit URL bounced you straight back to the detail screen — even though the server had always allowed the author to maintain their own entry. The screens asked "are you an admin?" where they should have asked "are you an admin *or* the author?". The same rule now covers deleting: the author may withdraw their own still-active entry (a plain delete, as the Firestore rules permit), while an admin's delete stays the audited moderation hide it always was.

- The pueblo's people stat went blank, and the village silently rendered as if you weren't a member, whenever one `municipalityPeople` row didn't match the current schema. The directory read shared a `Promise.all` with the membership fetches, so its strict-converter throw took `isMember`, `villageAdmin`, the pending-organizer flag and the censo answers down with the count. The directory now loads on its own: a failure costs the stat only.

- **Email-code sign-in now works.** Entering a correct 6-digit code failed with a server error on every attempt since the feature shipped (v0.17.0) — in production it never once succeeded. The code itself was fine; the final step, minting the sign-in token, was refused by Google Cloud. `createCustomToken()` signs through the IAM Credentials API as the Cloud Functions runtime service account, which must hold `roles/iam.serviceAccountTokenCreator` on itself; that binding was never granted, so signing was denied (`auth/insufficient-permission`). No test could catch it — the Auth emulator stubs token signing and never contacts IAM, so the suite passed against a project where this was broken. The binding has been applied to dev, beta and prod; a new pre-deploy CI gate (see Added) now keeps it that way.

- **~2,000 missing municipalities.** Villages in whole provinces could not be found in search or activated at all — La Rioja had 7 of its 174 municipalities, A Coruña 1 of 93, and Cataluña, Galicia, Cantabria and Asturias were almost entirely absent. The reference dataset that seeds the `municipalities` collection was generated with a Wikidata query matching `wdt:P31 wd:Q2074737` ("municipio de España") *directly*, but most municipalities are typed with a regional subclass ("municipio de La Rioja", "concello", "concejo"), so they were silently dropped. The query now traverses subclasses (`wdt:P31/wdt:P279*`) and also accepts `ciudad autónoma de España`, which is the only type Ceuta carries — Ceuta was missing entirely, and Melilla was present only by accident. The dataset goes from 6,184 to 8,167 entries, covering all 52 provinces (reported by a user whose village, Alesanco, was missing). The generator now fails instead of writing a partial dataset, and `scripts/seed-municipalities.mjs` gained `--env`/`--confirm`/`--dry-run` so each environment can be topped up deliberately. **Migration:** each env's `municipalities` collection is topped up by running `node scripts/seed-municipalities.mjs --env=<dev|beta|prod> --confirm` (purely additive — matched by `codigoINE`, existing docs including activated `community` overlays and escudos are never touched; already run against dev).

## v0.17.0 — 2026-07-26

### Fixed

- Email sign-in now uses a 6-digit code emailed to the user instead of a magic link. The link often opened in a different browser/webview than the one running the app (e.g. an email app's in-app browser), so the signed-in session landed in storage the app never read again — the device was never "remembered" the way Google sign-in is. The code is entered back in the same screen, so it persists the same way. The re-authentication step used by Settings → change email still uses a link (unaffected by this bug, and technically unable to move to a code).

## v0.16.0 — 2026-07-24

### Changed

- Reworded the place/festival-poster contributor credit as "Digitalizado por" and turned their creation screens into step-by-step wizards.

### Fixed

- Comments now show a newly registered author's public profile name while their persona is still becoming available, instead of temporarily labelling them “Usuario”.
- The **group (organization) detail** members list now shows each member's **full name with the apodo in parentheses** — e.g. "Juan García López (Juanito)" — matching the village Personas and barrio lists. It previously showed the apodo alone (or the short name when no apodo).
- The persona pickers when **registering for an event** and when **recording a burial** now list each persona by **full name with the apodo in parentheses**, matching the rest of the app. They previously showed the apodo alone for a persona with a nickname.
- Deceased personas no longer appear in the village **Pueblo people count** or the **Personas roster** opened from it. Both are backed by the function-owned `municipalityPeople` directory, which previously listed a persona for every municipality link regardless of death status; the `syncMunicipalityPeople` trigger now excludes deceased personas (a death date or a cemetery burial), removing their directory row when they die. **Migration:** existing directory rows for already-deceased personas are purged by re-running `scripts/backfill-municipality-people.mjs` (idempotent; run per env).
- Deceased personas no longer inflate a **barrio's resident count** (the population badge on barrio cards and the hub's population ordering). The `syncBarrioResidentCount` trigger now excludes deceased personas, matching the barrio residents list — so the count and the list agree. **Migration:** existing barrio counts are recomputed by re-running `scripts/backfill-barrio-resident-count.mjs` (idempotent; run per env).
- The Explora segmented toggle now uses higher-contrast text for inactive options.
- In the article/news editor, the bold/italic/link toolbar and the link-URL entry sheet now appear anchored just below the line you've highlighted, instead of always trailing the whole text block — easier to use in longer paragraphs.

## v0.15.0 — 2026-07-23

### Changed

- The village **Personas** roster now includes dependent personas linked to the village and is alphabetical. Tapping a name or avatar opens the user profile when an account is linked (or the persona profile otherwise); village-admin role changes remain behind the row’s separate arrow.
- People lists now show a person's **apodo (nickname) in parentheses after their full name** — e.g. "Juan García López (Juanito)" — in the village Personas roster and the barrio (vecinos) list. Sorting stays alphabetical by the real name. The barrio residents list is now one person per line, matching the village roster. **Migration:** the `municipalityPeople` directory `displayName` is re-projected by `scripts/backfill-municipality-people-nickname.mjs`.

### Added

- Place and festival-poster detail screens now recognize the people and village groups that contributed them. Creators are credited automatically, and editors can add or remove additional contributors without changing the underlying proposal owner or its permissions. **Migration:** existing dev places and posters are backfilled by `scripts/backfill-entity-contributors.mjs`.

### Fixed
- The persona ("team") cards on the profile now show each persona's **full name**, not their apodo. Previously a persona with a nickname showed the apodo as both the card title and the `@handle` subtitle — the nickname twice, and never their real name.
- Deceased personas no longer appear in a barrio's **Vecinos** (residents) list — they now show only in the cemetery where they're buried. A persona counts as deceased once they have either a recorded death date or a cemetery assignment.

## v0.14.0 — 2026-07-19

### Added
- Cemetery detail screens now have an **"Añadir difunto"** button so any resident — not just village admins — can record one of their personas a cargo as buried there. Picking (or creating) a persona opens a gentle "Lamentamos tu pérdida" step with an optional approximate death date (year alone is enough), then lists them among the cemetery's difuntos as a compact date-sorted list. Tapping an editable difunto opens a burial-date editor with an option to remove them from that cemetery. Cemetery cards on the Pueblo tab now show a person-count badge for added difuntos instead of the generic comment badge.
- Product-analytics engagement events: content-detail views, search submit/select, and org join & invite share — feeding the behavioral-dashboard initiative (Phase 1).

### Changed
- The village personas roster now shows only each person's avatar and name, plus censo completion when that village has a configured censo; join dates and role labels are no longer shown.

### Fixed
- The village personas roster now keeps the censo column aligned when some rows have an admin action arrow and others do not.
- Returning to the **Pueblo (village) tab** after opening an entity (event, article, cartel, barrio, lugar, peña…) now keeps your place. Previously the tab reloaded from scratch on every return — flashing skeletons and jumping back to the top — because the focus refetch blanked the whole screen to a spinner. The refetch now happens silently in the background over the already-rendered content, so both the vertical scroll position and each horizontal card row's position are preserved. The tab still fully reloads (spinner + skeletons) on first open and when you switch to a different village.
- The person birth-date month picker now shows full month names and gives modal options readable horizontal spacing.
- Tapping a resident (vecino) in a barrio no longer opens the editable person stepper. Registered users open their profile (the same view as a shared profile link), while dependent personas without an account are shown without a link. The barrio "Vecinos" heading now matches the "Comentarios" section heading style.
- Horizontal card rows on the **Pueblo (village) tab** and the **Perfil (profile)** screen are now usable on the web build's **desktop** (non-touch) screens. On a phone these scroll by touch-drag, but a desktop has no touch — so on a fine-pointer screen each row shows prev/next **arrow buttons** at its edges (each enabled only when there's more to scroll that way), and the row moves solely via those arrows. Native touch behaviour is unchanged; the arrows never appear on a touch screen.

## v0.13.0 — 2026-07-18

- Show each article's category instead of its publication date on village cards.

### Added
- **Sign-in/registration emails are now sent through a Cultuvilla-branded template instead of Firebase's built-in passwordless email.** A new unauthenticated `sendAuthSignInEmail` callable generates the Firebase email-link via the Admin SDK and delivers a Spanish HTML/text email — a wordmark header, a prominent "Entrar en Cultuvilla" button, a fallback plain-text link, and a security note — through Resend, sent from `acceso.cultuvilla.es` (SPF/DKIM verified). Rate-limited per email address (5 sends / 15 min, generic success response either way so a caller can't distinguish rate-limited from sent). Link redemption (`/finish`) is unchanged.
- **Organization admins can now manage membership from the org's member roster**: promote a member to admin, demote another admin back to member, or remove a member entirely — mirroring the pueblo's members list, routed through the audited `changeOrgMemberRole` callable (promote/demote) and the existing rules-gated member delete (remove).
- **Places, barrios and organizations now accept up to 5 pictures** instead of a single image, matching the convention already used by festival posters (`images[0]` is the hero shown in the detail screen; the rest render in a vertical stack below the title). Barrio residents are now shown as a wrapping row of avatar-and-name chips (matching an event's organizers) instead of full-image cards. News articles' inline body images are now capped at 10. **Migration:** existing dev docs are backfilled by `scripts/backfill-multi-image-entities.mjs`, converting the old `imageURL` into `images: [imageURL]` (or `images: []`).

### Removed
- The legacy organization join-request approve-flow (`organizationJoinRequests/`, `requestJoinOrganization`, `respondToJoinRequest`) — orphaned since joining a peña/asociación became instant self-service; no UI ever called the create-side callable. Removed the Firestore collection's rules/indexes, the two callables, `organizationJoinRequestService`, the mobile inbox's join-request section, and the corresponding notification types (`join_request_created/approved/rejected`).

### Changed
- Entity-backed censo questions now use a compact dropdown-style selector instead of showing every option inline; opening it shows each barrio, place, organization, event, festival poster, or article with its image.
- Account-access emails are now explicitly requested in Spanish for first-time sign-in, returning sign-in, reauthentication and email-change confirmation. Firebase's built-in email still has no Cultuvilla logo; richer branded HTML remains a separate custom-mail delivery change.
- Person birth dates now use dedicated **Año / Mes / Día** selectors again, making distant birthdays quicker to enter; event date-times, censo dates, and festival-poster dates keep the calendar picker.
- The censo builder's entity-backed answer options (a select/multiselect question whose choices come from a live village collection) now cover all six village entities — **events, festival posters (carteles) and news** join the existing barrios/places/organizations sources.
- The user menu now shares `https://cultuvilla.es`, removes the obsolete "Mis solicitudes" placeholder, and uses a larger green title.
- The pueblo (village) tab now orders **peñas / agrupaciones by member count** and **barrios by resident count** (largest first, name as tie-break), so the busiest groups lead each row. The counts are now denormalized onto the org/barrio docs (`memberCount`, `residentCount`) and kept live by Cloud Function triggers, replacing the per-entity count queries the tab used to fire on every load. **Migration:** existing dev docs are backfilled by `scripts/backfill-org-member-count.mjs` and `scripts/backfill-barrio-resident-count.mjs`; the new fields are function-owned (clients cannot write them).

### Fixed
- Google sign-in opens its account-selection popup again on the web build after explicit auth persistence initialization accidentally omitted Firebase's browser popup resolver.
- An organization's founder could not edit their own org (including changing its image) after creation. The Firestore update rule checked only village-admin/app-admin, missing the org-admin case — the mobile edit screen already granted access via `useOrgCapabilities`, so every save was silently rejected by rules.
- Peña actions now use specific request copy: the detail FAB says “Unirme a esta peña” and the creation form says “Enviar solicitud”.
- Web sign-in now pins an explicit auth persistence chain (indexedDB → localStorage → in-memory) instead of relying on the Firebase SDK's environment auto-detection, which could silently downgrade to session-only persistence in storage-restricted contexts (Safari private browsing, in-app browser webviews) and force users back through the passwordless email-link sign-in on every visit.
- Festival poster creation by a non-admin village member no longer fails Firestore rules validation. The create rule still checked for a scalar `imageURL` field, which the model stopped writing when posters moved to a multi-image `images[]` array; only admins (who bypass the check) could create posters until now.
- The profile's Grupos stat now includes peña memberships instead of counting only non-peña organizations.
- Profile section titles now use the same font size as the pueblo tab, removing the smaller headings previously used by Personas, managed events, created news and Pueblos.
- Opening a shared village link (`/village/<id>`) now always lands inside the app shell (bottom tabs + header) for signed-in members too, not just guests. Previously a signed-in visitor got a chrome-less, tab-less dead-end screen. A cold entry (no back stack) redirects into the pueblo tab showing the shared village; in-app navigation to a village (from discovery, a profile, the inbox or a news mention) keeps its back-navigable detail screen. The shared village rides a transient `villageId` query param, so a member's home village (`activeMunicipalityId`) is never silently switched.

## v0.12.0 — 2026-07-16

### Fixed
- Shared links in production now use the brand domain `cultuvilla.es` instead of the `cultuvilla-prod.web.app` Firebase default. All share/invite/deep links (`/event`, `/news`, `/village`, `/o`, `…/join`) and the native App/Universal Link association now carry `cultuvilla.es`.

## v0.11.0 — 2026-07-16

### Added
- **Formato de texto y enlaces por selección en los artículos.** Al escribir una noticia, seleccionar texto muestra una barra con **negrita**, **cursiva**, **subrayado**, **tachado** y **enlace**: cada botón pone/quita su estilo sobre la selección, y el de enlace convierte el texto seleccionado en un enlace introduciendo su URL (se valida como `http/https`). Los estilos pueden combinarse entre sí y coincidir con una mención o un enlace sobre el mismo texto. Convive con el flujo anterior de pegar una URL. El modelo de bloques gana un array tipado `marks` (y `captionMarks` en las imágenes) que sustituye al `bolds` anterior; los artículos antiguos siguen leyéndose vía `.default([])` y se migran con `scripts/backfill-news-marks.mjs`.

### Changed
- The pueblo (village) tab now shows past events again: its events row loads both `published` and `completed` events and lists upcoming first, then past (most recent first). Previously finished events vanished once the hourly completion job flipped them to `completed`.
- Each pueblo-tab scroll (events, news, festival posters, barrios, places, organizations) now loads independently with its own skeleton placeholder, and a single failed section hides itself instead of blanking the whole tab.

## v0.10.0 — 2026-07-12

### Changed
- Analytics consent is now granted implicitly by accepting the Terms & Conditions; the standalone analytics consent bar has been removed.
- Pre-release, the `/descarga` endpoint redirects straight into the web app instead of showing a landing page. The App Store / Play Store download landing stays gated behind `APP_AVAILABLE` until the native apps ship.
- Organization visibility control is now a **Privacidad** section whose label reflects the current state instead of an extra hint line.
- The branded `/descarga` QR now uses a plain square logo backing (no rounded corners), with the logo trimmed for an even, centred fit.

### Fixed
- The article editor now shows a blinking caret on the web build.

### Tooling
- Required-field backfill scripts can target beta/prod via `--env` (with `--confirm`).
- commitlint accepts a bare `X.Y.Z` version-bump commit message.

## v0.9.0 — 2026-07-11

### Added
- **Enlaces externos en los artículos.** Al escribir una noticia puedes **pegar un enlace web** y, en ese momento, darle opcionalmente un texto a mostrar (p. ej. "compra tus entradas" en vez de la URL cruda); si lo omites, la URL queda igualmente pulsable. Cualquier URL `http(s)` escrita o pegada en el cuerpo —y en artículos antiguos— se detecta y se vuelve un enlace pulsable automáticamente. Los enlaces se abren en el navegador del sistema. El modelo de bloques gana un array `links` (y `captionLinks` en las imágenes) que solo persiste los enlaces con texto personalizado; las URLs sueltas se resuelven al renderizar. Guardado tras una comprobación de esquema `http/https` (los `javascript:`/`data:` nunca se abren).
- Add `/descarga` landing endpoint and a branded QR generator (`pnpm qr:generate`) encoding `https://cultuvilla.es/descarga` — a print-once QR that works on web now and will open the native app once released.
- **Pull-to-refresh inside every entity detail screen.** Events, news posts, festival posters, places, barrios, and organizations can now be refreshed in place — pull down (or, on desktop web, scroll up at the top) to re-fetch the screen's data. The gesture lives once in the shared `EntityDetailScaffold` (native `RefreshControl` on iOS/Android, the existing web-gesture hook on the Firebase Hosting build), so every detail screen gets it. The feed's `PullSpinner` was promoted to a shared component so the pull affordance looks identical everywhere.
- Events can be flagged as requiring payment; organizers mark who has paid per attendee.

### Changed
- **La lista de espera de un evento ahora se ve, tanto al apuntarte como al gestionar asistentes.** El botón flotante de inscripción (`RegisterFab`) ya no muestra siempre "Apuntados (N)": si estás en lista de espera aparece "En lista de espera (N)", y cuando tienes personas confirmadas *y* en espera se muestran **dos botones** contiguos, cada uno con su recuento (verde ✓ confirmados, ámbar ⏳ en espera). En la vista de organizador (`EventAttendees`), el listado plano se ha dividido en dos secciones con recuento —**Asistentes (N)** y **Lista de espera (N)**—, respetando el orden de cola (`position`) dentro de cada una; la sección de espera solo aparece si hay alguien esperando. La promoción de la lista de espera sigue siendo **automática** (un trigger de Cloud Function asciende al siguiente en cola al liberarse una plaza confirmada); no se añade acción manual de promoción.

## v0.8.0 — 2026-07-11

### Added
- **Comments on every village entity, plus an invisible view count.** Events, festival posters, places, barrios, organizations, and news posts each get a comments thread, with the count shown on their cards and detail screens. Backed by a generic top-level `comments/` collection (entity-scoped via `entityKind`/`entityId`) — anyone can read, signed-in users can post, and authors, village admins, or app admins can delete. `commentCount` is denormalized onto each entity doc by a shared trigger. Each detail screen also fires a fire-and-forget `recordEntityView` callable on mount, which increments a function-owned `readCount` field — no reactions/likes UI, and the count isn't surfaced anywhere yet.
- **Los carteles de fiestas admiten ahora varias imágenes (máx. 5).** La primera imagen es la portada que se ve en la tarjeta y como imagen principal del detalle; las demás se muestran en vertical bajo las fechas, desplazándote hacia abajo. Los formularios de crear/editar usan una fila de miniaturas cuadradas con un botón "+" a la derecha para añadir más. **Migración:** el modelo pasa de `imageURL` (una URL) a `images: string[]`; los documentos de dev (`villa-events`) se migran con `scripts/backfill-festivalPoster-images.mjs` (`imageURL` → `[imageURL]`).
- **Observability foundation: crash/error reporting, product analytics, and consent.** Client-side crashes and thrown errors now bridge to Cloud Logging + Cloud Error Reporting via an auth-gated `logClientError` callable (`functions/src/observability/`), which stamps the server-authenticated uid and HMAC-hashes it (`OBSERVABILITY_USER_ID_SALT`, Secret Manager) before it ever reaches a log line — no raw uid leaves the server. Firebase Analytics product events (denied-by-default, gated on a new `ConsentBar` opt-in) instrument four funnels: onboarding, village join, event sign-up, and organization creation, using a fixed `<domain>.<action>.<outcome>` taxonomy (`OBSERVABILITY_EVENTS`) so event names can't drift or typo silently. The whole thing is a platform-free port (`packages/shared/src/services/observability/`) — screens call `observability.trackEvent`/`captureError`/`logger.*` directly; only the mobile adapter (`apps/mobile/lib/observability/`) touches Firebase Analytics or the callable. A single PII allowlist (`ALLOWED_CONTEXT_KEYS`) filters every payload before it leaves the port; error/log diagnosis flows regardless of analytics consent. See the new `observability-conventions` skill for the event-naming and debugging conventions.
- Own profile: add and leave your villages (with confirmation) directly from the profile editor, and set a barrio per village — matching the persona residence editor.

### Fixed
- **A "deleted" event no longer lingers in your profile's managed-events list.** Deleting an event from its edit screen soft-cancels it (`status` → `cancelled`), which the public feeds already hide — but the profile's "managed events" scroll and the events-created stat read `getEventsByOrganizer`, which had no status filter, so cancelled events kept showing on your own profile. `getEventsByOrganizer` now drops `cancelled` events (keeping `published` + `completed`); filtered client-side to avoid a `status`+`array-contains` composite index. No data or rules change.

### Changed
- **Selector de fecha con calendario (estilo Órdago), igual en web y móvil.** Elegir una fecha (cumpleaños de una persona, censo, fechas de un cartel de fiestas) o una fecha y hora (inicio/fin de un evento) ahora abre una **cuadrícula de calendario mensual** —cabecera con flechas de mes y título de mes/año pulsable para saltar a otro año (p. ej. un cumpleaños de 1974) sin recorrer meses uno a uno—, en lugar de las antiguas listas de Año/Mes/Día o la rueda del sistema. La hora se elige con un **reloj de 24 h táctil** (esfera con anillo exterior 1–12 y anillo interior 13–23 + 00); tanto la fecha como la hora se abren en un **diálogo compacto** (no a pantalla completa), y los botones ahora muestran "Seleccionar fecha" y "Seleccionar hora" por separado. Al crear un evento, la hora de inicio viene precargada con la hora actual. Todo se dibuja en JavaScript, así que se ve y se comporta igual en la web y en el móvil (antes la web mostraba ruedas y el móvil el diálogo nativo). Internamente unifica los dos campos (`DateField`, `DateTimeField`) sobre dos primitivas nuevas (`CalendarDatePicker`, `ClockTimePicker`) y **elimina la dependencia nativa `@react-native-community/datetimepicker`**.

## v0.7.0 — 2026-07-10

### Changed
- **Opening a shared village link while logged out now lands you inside the app shell, not a chrome-less dead-end.** A `…/village/{id}` share link rendered the pushed village detail screen — a bare page with only a back button, no bottom tabs and no header, and nowhere to go. A logged-out visitor is now sent into the tab shell (bottom tabs + `AppHeader`) with the shared village set as their **active village**, so it shows in the Village tab exactly as it would for a member (with the join CTA). The active village is held in a new guest-scoped context/`AsyncStorage` store (`GuestActiveVillageProvider`), unified with a signed-in user's `activeMunicipalityId` via `useActiveVillageId`; the Village tab stays un-gated for a guest while they have one, and signing in clears it so the real profile wins. Signed-in users are unaffected (they still get the back-navigable detail screen).

### Fixed
- **Event sign-up sheet again lists the personas linked to your profile.** Opening the register FAB showed only yourself + "create new" — every persona a cargo was missing, even though they render fine on the profile screen. Cause: the FAB's `load()` runs `Promise.all([getUserRegistrations, getPersonsByCreator])`, and `getUserRegistrations` (a **collection-scoped** `events/{id}/registrations` where `userId == uid` query) was throwing `FAILED_PRECONDITION`, so the whole load rejected and `setDependents` never ran. The v0.5.0 account-deletion fix had added a `registrations.userId` `fieldOverride` with **only** a `COLLECTION_GROUP` index; declaring a field override *replaces* Firestore's automatic single-field indexing, which silently removed the `COLLECTION`-scope index the sign-up query needed (the emulator ignores indexes, so tests stayed green). Restored the `COLLECTION`-scope index alongside the `COLLECTION_GROUP` one in `firestore.indexes.json`, plus a static invariant test that fails the build if a field override drops the collection-scoped index a collection-scoped query depends on. **Deploy note:** the index must be deployed per environment (done on dev; beta/prod via promotion) before the fix takes effect there.
- **Persona creation now gates required fields per step instead of only at the final "Guardar".** The linked-persona create form (`person/new`) let you walk the whole stepper with just a given name + sex and hit the requirement as a submit-time error, instead of being stopped on the step that owns the field. The identity step now gates on given name + first surname + sex, and the residence step requires the birthday (new `requireFirstSurname` prop on `PersonForm`); the second surname stays optional. The photo and biography labels dropped their "(opcional)" suffix. Onboarding's stricter self-profile gate (`requireFullName` — both surnames + 14+ birthday floor) is unchanged.

## v0.6.0 — 2026-07-10

### Fixed
- **Registration no longer fails with "Missing or insufficient permissions" when a village is picked.** Completing a profile while selecting a pueblo could abort at the last step: `ensureVillageMembership` → `joinVillage` calls `setActiveMunicipality`, an `updateDoc` on `users/{uid}`, and the account doc didn't exist yet (onboarding created it only *after* the village join, relying on the async `syncPersonDenormalization` trigger to have landed its `displayName` stub). An `updateDoc` against a missing doc makes the `users` update rule dereference a null `resource.data`, which Firestore denies. Onboarding now writes the account doc (`createUserProfile`/`patchUserProfile`) **before** joining the village, so `users/{uid}` always exists first. Regression test added in `complete-profile.test.tsx` (asserts the account write precedes the village join). No rules or data change. (The COOP `window.close` console warning some users saw during Google sign-in is unrelated and benign — it comes from Firebase's popup, not our code.)

## v0.5.0 — 2026-07-10

### Added
- **Blocking "please wait" overlay while an entity is being deleted.** Confirming a delete from any edit screen (event, article, place, barrio, organization, festival poster, or persona) now raises a non-dismissible full-screen overlay — a dimmed scrim with a spinner and a per-entity label (e.g. "Eliminando evento…") — so it's obvious the write is in flight and to wait, rather than tapping again or navigating away. The overlay lives in the shared `DeleteHeaderButton` (new reusable `BlockingOverlay` primitive) and clears automatically when the delete navigates away, or on error.

### Removed
- **Per-section "add" cards and the map "add location" placeholder on the village home.** Creating content is now solely the "Añadir contenido" button (the sheet already routed to every entity's create screen); the dashed add card that trailed each horizontal scroll (events, artículos, carteles, barrios, lugares, agrupaciones, peñas) is gone. **A section with no entities is now hidden entirely** instead of showing an empty-state/add card (`Section` returns null when `isEmpty`). The map slot's dashed "Añadir ubicación" placeholder is likewise removed — when a village has no coordinates the slot renders nothing, and location is set only from the edit-village ("Detalles") flow, which already owns `LocationPicker`. `Section` dropped its `onAdd`/`addLabel`/`emptyLabel` props (`AddCard` stays — profile scrolls use it). Dead i18n keys pruned.

### Fixed
- **Account deletion no longer 500s.** `deleteAccount` cleans up a user's event registrations with a `registrations` collection-group query on `userId`, which needs an explicit `COLLECTION_GROUP` single-field index — Firestore's automatic single-field indexes are collection-scoped only, so the query threw `FAILED_PRECONDITION` in beta (the emulator that backs our tests never enforces indexes, so it passed CI). Added the `registrations.userId` `fieldOverride` to `firestore.indexes.json`, plus a static invariant test (`packages/shared/test/firestore/collectionGroupIndexes.test.ts`) that fails the build if any `collectionGroup(...).where(...)` in the codebase lacks a matching `COLLECTION_GROUP` index. **Deploy note:** the new index must be deployed to each environment (dev on merge to `develop`, beta/prod via promotion) before the fix takes effect there.
- **Picking a village at registration now actually makes you a villager.** Choosing a pueblo in the complete-profile flow only set your *residence* and active village before — it never created the `municipalities/{id}/members/{uid}` membership doc the profile's "tus pueblos" list reads, so the selected village never showed up there. Onboarding now routes the selection through a new `ensureVillageMembership` service: an already-active village is a plain self-service join; a **dormant** municipality is activated on the spot via the existing self-service `startVillage` callable (which seats you as its first member, `role: user` — no organizer/admin granted; escudo and details are filled later from the village tab). Either way a membership doc lands, so the village appears under "tus pueblos" and as the active pueblo. Tapping **"Inicia sesión para unirte"** on a village while logged out now also carries that village across sign-in (new `pendingVillage` store threaded through `requireAuth`): a new user lands in onboarding with it pre-selected (and gets joined on submit), an existing user resumes to the village page.
- **Occupation form no longer shows the "otra ocupación" free-text field up front.** In the profile/onboarding occupation picker, the custom occupation input now appears only after tapping the "Otro" chip, and hides again when it's deselected. "Otro" is a reveal toggle, so it's no longer stored as an occupation of its own alongside the typed value.
- **Onboarding now enforces the 14+ self-registration age the Terms require.** The birthday step's date picker is capped at 14 years ago and submit is blocked (with an inline "Debes tener al menos 14 años…" message) if the birthday is under-age — the picker caps by year, so the explicit check also catches a same-year under-age date. This gates only the account owner's own profile; family "personas" still have no age floor (an adult registers them). Age math lives in a shared, unit-tested `maxBirthdayForAge`/`isAtLeastYearsOld`; the floor is `MIN_SELF_REGISTRATION_AGE` (14) in `@cultuvilla/shared`.

## v0.4.0 — 2026-07-10

### Changed
- **Article authorship is now editable after creation.** The news composer's "Autoría" step used to show a "no se puede cambiar" notice in edit mode; it now shows the same organizer picker as create, so any current organizer can reassign writers/organizations. `organizerUserIds`/`organizerOrgIds` were dropped from the client `updateNewsPost` forbidden-keys guard and the Firestore `news` update rule's immutable-field list — the update rule keeps authority on the *current* organizer set and now also requires `organizerUserIds` to stay non-empty (so a post can't be orphaned). `createdBy` and the lifecycle/counter fields remain immutable. No data migration (existing docs already carry both fields).
- **Article `@`-references now cover every entity, and no longer people.** The mention picker offers the full entity family — organization, event, place, **barrio**, festival **poster (cartel)**, news — plus the pueblo (village); barrio and poster mentions are new and link to their detail screens. **Persons/members are no longer mentionable** (they had no public profile screen, so a person mention only ever rendered styled-but-dead). `MENTION_ENTITY_TYPES` dropped `user` and added `barrio`/`festivalPoster`; `useMentionSources` no longer does an N-read fan-out over village members.

### Added
- **Terms of Use & Privacy Policy — acceptance required at onboarding.** Completing your profile now requires ticking a consent checkbox ("Acepto los Términos de uso y la Política de privacidad", with inline links to both) before the account can be created; the submit button stays disabled until it's checked. The user doc records a versioned acceptance (`termsAcceptedAt` + `termsVersion`, seeded from `CURRENT_TERMS_VERSION` in `@cultuvilla/shared`) so future legal changes can re-prompt stale versions. The two documents (Spanish, RGPD/LOPDGDD + LSSI-CE) render as in-app screens at `/legal/terms` and `/legal/privacy`, now reachable from the previously "próximamente" Legal entries in the user menu. New `Checkbox` primitive. Existing dev user docs backfilled (`scripts/backfill-terms-acceptance.mjs`); the new fields are added to the `users/{uid}` firestore.rules allowlists.
- **News image captions support `@`-references too.** The pie de foto is now the same `@`-mention field as the body paragraphs — type `@`, pick a reference, and it renders highlighted and tappable on the reader (the caption editor was a plain input before). Image blocks gained a `captionMentions` span array (`NewsImageBlockSchema`, `.default([])` for legacy blocks; existing dev docs backfilled via `scripts/backfill-news-caption-mentions.mjs`).
- **"Pueblo" section on the event detail screen, plus tappable organizers.** Below Organizadores, the event now shows the village as a chip — a circular escudo + name matching the organizer chips — that opens the village detail screen. The escudo is fetched on demand from the municipality doc (`getMunicipality`) since it isn't denormalized onto the event. The Organizadores chips are now tappable too: an organization opens `/o/[orgId]` and a user opens `/user/[uid]` (via a new optional `onPress` on `LiveOwnerChip`).
- **News composer: `@`-references now read as their bare name and delete atomically.** Picking a reference from the `@`-autocomplete drops the leading `@` and shows the name in the accent colour (a scroll-synced styled overlay over a transparent-text field, same font weight so the web caret stays aligned), making it obvious the reference took. Backspace/Delete at a reference's edge now removes the whole reference in one keystroke instead of character-by-character. The run-splitter behind the reader's `RichText` was extracted to a shared, unit-tested `mentionRuns` helper; a dev backfill (`scripts/backfill-news-mention-at.mjs`) strips the stored `@` from existing news mention spans.
- **Delete now lives in each entity's edit screen, not its detail header.** Every editable entity (article, event, place, barrio, organization, festival poster) exposes a `trash` icon in its edit-screen header (`DeleteHeaderButton`, gated to who can manage it, behind a confirm dialog that works on web via `window.confirm`). The event's old detail-header delete moved here and stays a **soft cancel** (`status → cancelled`, registrations preserved) under a "delete" label. Article delete is a new hard delete routed through the existing cascading `deleteNewsPost` callable — now also authorized for the post's **author** (previously admin-only), so it cleans up comments/reactions/reports. Festival posters gained a dedicated edit screen (they had none) plus an edit action on their detail header. The village-management manager lists keep their own delete too.
- **Unified "Buzón" inbox, reached from the header bell.** The old "Solicitudes" screen is gone; the bell now opens a single feed at `/inbox` that pins actionable items (organizer/organization requests you can approve or reject) on top, with read-only activity — notifications and your own still-pending sent requests — below. The bell shows an unread badge (pending-actionable count plus unread notifications) and marks everything read on open. New `inboxService` (shared) combines the two sources; no new collection.
- **Dedicated "Personas" (villagers) screen, reached from the village stat.** The villagers roster moved out of the "Editar pueblo" stepper into its own screen (`village/[villageId]/members`), opened by tapping the *personas* stat on the village home — now tappable for members only. Every member sees the full roster (name · role · censo · alta); admins keep the promote/demote row action. With the roster gone, "Editar pueblo" collapses from a two-step stepper to a single auto-saving *Detalles* screen with a *Listo* button.
- **Settings screen with account lifecycle — change email & delete account.** The previously-disabled "Ajustes" row in the user menu now opens a Settings hub ([apps/mobile/app/settings/](apps/mobile/app/settings/)) with a Cuenta section. **Change email** (`/settings/change-email`) uses Firebase `verifyBeforeUpdateEmail` — a confirmation link is sent to the new address and the change commits only when clicked. Because Firebase requires a recent login, a magic-link **re-authentication** round-trip to the current email is built into AuthContext (a distinct `cultuvilla.pendingReauth` intent, replayed via the central `finish.tsx` deep-link handler); the account's Firestore `email` is synced on resume, gated by a new Firestore rule requiring it to equal the verified `request.auth.token.email`. Change-email is hidden for Google-only accounts (they manage email in Google). **Delete account** (`/settings/delete-account`) is an RGPD/GDPR erasure via two callables: `checkAccountDeletable` lists any village/org where you're the **sole admin** (deletion blocked until you hand off), and `deleteAccount` — after a typed "ELIMINAR" confirmation — anonymizes authored news/events (reattributing `createdBy` to a `DELETED_USER_UID` sentinel, removing you from `organizerUserIds`) while hard-deleting your personal data (person profiles + dependent personas, memberships with audited `removed` events, registrations, notifications, organizer requests, news comments/reactions/reports, Cloud Storage photos, the user doc) and finally the Firebase Auth user. Org member docs gained a `userId` field (backfilled on dev) so the sole-admin check can enumerate org memberships.

### Changed
- **Content moderation is now optimistic, not gate-then-approve.** News posts, festival posters, barrios, and places appear immediately on creation — any village member creates them directly (no more `pending` review queue, no "Proponer" step). Removal is a reversible **soft-hide framed as delete**: the "Eliminar" action in an admin-gated entity's edit stepper (barrio, place, festival poster) now calls the audited `setContentVisibility` callable — the content drops out of every feed and the write is recorded in a new `moderationEvents/` log — instead of hard-deleting the doc (so person references to a barrio/place never dangle). News keeps its author hard-delete (cascading `deleteNewsPost`) in its own edit stepper. This removes the news auto-approve/reject flow (`moderateNewsPost`), the trusted-author auto-approve bypass (`trustedNewsAuthor`/`setTrustedNewsAuthor`, now deleted), and the `approveBarrio`/`approvePlace` gates. Organizations and organizer requests are unaffected — their approval still grants admin authority, so that gate stays as-is.
- **Occupations no longer go through an approval queue.** Adding an occupation to a person now offers a predefined catalog (`OCCUPATION_CATALOG`) plus a free-text fallback — `recordOccupation` upserts the entry into `occupations/{slug}` for future autocomplete, with no `occupationProposals/` review step. The old propose → app-admin-review → promote pipeline is removed.

### Removed
- **"Editar pueblo → Contenido" moderation tab.** The village edit screen is now two steps (Detalles + Miembros); the `VillageContentManager` tab that listed places/barrios/organizations/carteles for approve/reject/edit/delete is gone. Org approvals already live in the Buzón; per-entity edit + delete now live on each entity's own edit screen; and entity submission is moving to an approval-free optimistic flow. The four proposable managers were reduced to create-only (their `manage` mode, `ProposableListItem`, `PendingBadge`, and the `ManagerMode` type were deleted). No approve/reject surface is lost that isn't covered elsewhere.

### Fixed
- **Event "Eliminar" appeared to do nothing.** The event edit-stepper delete soft-cancels (`status → 'cancelled'`, which the feeds already drop via their `status == 'published'` filter), but it navigated back to the event's own detail — which renders regardless of status — so the event looked untouched. It now navigates to the village after cancelling, so the removal is visible. Personas gained a delete too: the persona edit screen shows a header "Eliminar" for a dependent persona you created (`createdBy == uid && userId == null`, matching the persons delete rule), hard-deleting it via `deletePerson` behind the shared confirm dialog; your own account-persona is not deletable here.
- **Inserting an image split a paragraph mid-reference (and mid-word).** When you picked an `@`-reference and then added an image without clicking elsewhere, `BlockEditor` split the paragraph at a stale caret offset — landing inside the just-inserted reference — because a programmatic mention insert/delete moved the field's caret without the native `onSelectionChange` firing on web. The composer now reports the new caret to the parent after a mention insert or atomic delete, so the image lands at the real cursor.
- **Org creators weren't notified when their organization was approved or rejected.** A new `onOrganizationUpdated` trigger emits `org_approved`/`org_rejected` to the requester on the `pending → approved|rejected` transition (both the approve callable and the client-write reject path), so this now shows up in the requester's Buzón like every other outcome. The redundant approver-side "request created" notifications (for organizer and org-join requests, which duplicated what the live request list already showed) were dropped.

## v0.3.0 — 2026-07-09

### Removed
- **"Invitar vecino" button on the village screen.** Joining a village is open self-service — the "Unirme" button, the `joinVillage` service, and the Firestore self-add rule are all available to any authenticated non-member regardless of an invite. The village invite deep link (`/village/<id>/join`) granted no extra capability; it only flipped a cosmetic "Te han invitado…" banner. So the village invite is gone entirely: the members-only invite button, the `getVillageInviteLink` builder, the `/village/[villageId]/join` redirect route, the `arrivedViaInvite` banner, and the `village.invite.title` / `village.invitedBanner` / `deeplink.share.village.invite` strings. Sharing a village is now the single "Compartir pueblo" action. **Organization invites are unaffected** — `getOrgInviteLink` and the `/o/<id>/join` flow still use the shared invite machinery.

### Fixed
- **Invite link left a logged-in member stuck on a loading spinner on the web build.** `useDeepLinkRouter` (a native `Linking`-based hook) also ran on web, where expo-router already resolves every deep link by file route — so its `router.replace` raced the `join.tsx` route redirect during the auth/profile load and kept re-triggering the village screen's focus-load, hanging on a spinner. The hook is now native-only (`Platform.OS !== 'web'`); web routing is owned entirely by expo-router (content routes + the invite `join.tsx` redirects). A member tapping the invite now simply lands on the village. Covered by a jest web-no-op test and a logged-in-member Playwright flow.
- **"Invitar vecino" (and other share buttons) rendered the link twice in one message.** `useShareDeepLink` passed both `message` (which already embeds the URL via `buildShareMessage`) and a separate `url` to `Share.share`, so the Web Share API and iOS emitted the link twice. Now only `message` is passed — one link on every platform (Android already ignored the separate `url`). Regression covered by a new jest test.

### Added
- **"Editar pueblo" moved into the "Añadir contenido" sheet; barrio cards show "X vecinos".** The standalone "Editar pueblo" action pill is gone from the village action row; admins now open the edit stepper from a "Detalles pueblo" row prepended to the "Añadir contenido" sheet (gated by `canManage`, same visibility as the old pill — the sheet opener now also shows for admins who aren't members). The sheet's heading matches the village-name olive and is slightly larger than the option rows, and the sheet is reliably dismissable on the web build (backdrop uses `absoluteFill`, not a collapsing `flex-1`; the grab handle also closes it). Barrio cards on the village home gained a "X vecinos" subtitle, counted per barrio via a new `personService.getBarrioResidentCount` server-side count aggregate fanned out in `useVillageHome` (whole-village members with no specific barrio aren't counted). Also renamed the "Agrupación" add option to "Grupo".
- **"Añadir contenido" — single add entry point on the village screen.** The members-only first action-row slot (freed when "Invitar vecino" was removed) now hosts an "Añadir contenido" button that opens a bottom sheet ("¿Qué quieres añadir?") listing all seven addable entities — evento, artículo, agrupación, peña, barrio, lugar, cartel de fiestas — each fanning out to that entity's existing create route (new `AddContentSheet` in [apps/mobile/components/feature/AddContentSheet.tsx](apps/mobile/components/feature/AddContentSheet.tsx)). No new create logic: peña/agrupación route to the org create screen with a preselected type (`?type=pena|asociacion`, threaded via a new `initialType` prop on `OrganizationsManager`). The per-section inline add/propose cards are unchanged; this is an additional shortcut. As part of the same action-row cleanup, **admins now see "Compartir pueblo" alongside "Editar pueblo"** (previously Editar hid Compartir).
- **When/where cards on event detail (ordago-apps style).** The event detail screen ([apps/mobile/app/event/[eventId].tsx](apps/mobile/app/event/%5BeventId%5D.tsx)) now shows the date/time and location as two tappable "rectangles" instead of a plain date line + inline map button: the date card adds the event to the user's calendar, the location card opens directions in Maps. Calendar uses a Google Calendar `TEMPLATE` link opened via `Linking` (`buildGoogleCalendarUrl` in [packages/shared/src/utils/calendar.ts](packages/shared/src/utils/calendar.ts), vitest-covered) — no native module, works on the web build.

### Fixed
- **Explore feed refreshes on return.** The Explora events feed ([apps/mobile/app/(tabs)/index.tsx](apps/mobile/app/(tabs)/index.tsx)) loaded once on mount and never revalidated, so an event you just created (or any newly published event) only appeared after a manual page refresh. It now refetches on screen focus via `useFocusEffect`, matching the pattern already used by the village home and the org/place/barrio detail screens.
- **Organizer avatars now load on event & news detail.** A `user`-type owner's avatar lives on their linked person doc, but `useOwnerSummary` ([apps/mobile/lib/useOwnerSummary.ts](apps/mobile/lib/useOwnerSummary.ts)) only read the (frequently null) `photoURL` off the user doc, so organizer/byline chips fell back to initials. The hook now resolves the linked person (`getPersonByUserId`) and uses its photo as the fallback, fixing every `user`-type `LiveOwnerChip`/`LiveAvatar` that didn't already pass an explicit `imageUri`.

### Changed
- **Residence barrio is now single-source-of-truth on `persons.municipalityLinks`.** The duplicated `member.barrioId` field and the projecting `syncMemberBarrioToResidence` trigger are retired: residence lives only on the person doc (the `getPersonsByBarrio` query surface), written directly by the owner. `joinVillage` became an atomic `writeBatch` (member doc + residence link in one commit — no eventual-consistency lag); changing barrio goes through the new `personService.updateResidenceBarrio`; `updateVillageMemberBarrio`/`addVillageMember` are gone. The trigger is now delete-only (`onDocumentDeleted`) — it cleans an ex-member's link when an admin removes them (the one case the owner can't self-write). Server-side member creations (`acceptInvite`, `startVillage`, `respondToOrganizerRequest`) project the residence link in-transaction via a shared `residenceProjection` helper. The `firestore.rules` members owner-update no longer accepts `barrioId`. **Migration:** `scripts/backfill-drop-member-barrio.mjs` reconciles then deletes `member.barrioId` — run it **after** the new code deploys in each env (the old converter requires the field). Residence writes stay unvalidated (parity with the non-account path); a shared validating callable is the documented upgrade path if the censo ever needs integrity by construction. See [docs/decisions/per-village-barrio-membership.md](docs/decisions/per-village-barrio-membership.md).

## v0.2.0 — 2026-07-09

### Added
- **Promote/demote village members from the Miembros tab.** The community ("Editar pueblo") members roster ([apps/mobile/components/feature/MembersList.tsx](apps/mobile/components/feature/MembersList.tsx)) is no longer read-only: village admins and app admins can tap a member row to make them an admin (or a tapped admin back to member), routed through the audited `setVillageMemberRole` callable. Your own row and the founding organizer's demote path are non-actionable (self-lockout / the callable rejects the organizer demote); the backend remains the enforcement backstop. This makes adding a second village admin possible in-app for the first time.
- **Edit button on organization, place, and barrio detail screens** for users with edit permission (org admins for orgs; village/app admins for all three), reusing the creation form (`ProposableForm`) pre-filled with the entity's current values. New `FloatingEditButton` (top-right hero affordance), a `useOrgCapabilities` hook backed by a new `isOrgAdmin` service helper, and per-entity edit routes (`/o/[orgId]/edit`, `.../place/[placeId]/edit`, `.../barrio/[barrioId]/edit`) that redirect out when the viewer lacks permission.
- **Enriched organizer-request inbox cards** for super admins: each card now shows the requester's name and photo and links through to the requester's user profile and to the target village.
- **Read-only user profile screen** at `/user/[uid]`, sharing a `ProfileView` + `useProfileData` with the existing self-profile tab.
- **Square-image crop step (avatars, personas, escudos, community settings).** Picking any square image behind `pickImageAsBlob({ square: true })` routes through a platform-split cropper: **native** ([apps/mobile/lib/imageCrop.tsx](apps/mobile/lib/imageCrop.tsx)) uses expo-image-picker's built-in OS crop editor (`allowsEditing` + 1:1, matching the sibling ordago-apps), and **web** ([apps/mobile/lib/imageCrop.web.tsx](apps/mobile/lib/imageCrop.web.tsx)) — where `allowsEditing` is a no-op — gets a `react-easy-crop` pan/zoom overlay mounted once at the app root (`<CropperHost/>`), capping output at ~1024px. No native module, so no dev-client rebuild is required.
- **Context-aware biography prompt.** On your own profile the biography field now reads *"Cuenta algo al pueblo sobre ti"*; linked personas keep the neutral *"Biografía (opcional)"* ([apps/mobile/components/feature/PersonForm.tsx](apps/mobile/components/feature/PersonForm.tsx) `selfProfile` prop).
- **End-to-end web testing substrate + first Playwright flows** (Stage 3 of [docs/plans/ongoing/testing-enhancement.md](docs/plans/ongoing/testing-enhancement.md); see [docs/plans/ongoing/e2e-substrate.md](docs/plans/ongoing/e2e-substrate.md)). Real user journeys now run over the Expo web export against the Firebase emulator on every relevant PR (a new `web-e2e` CI job in `mobile-ci.yml`). Pieces:
  - **Emulator-connect seam** ([apps/mobile/lib/firebaseInit.ts](apps/mobile/lib/firebaseInit.ts)) wires the client SDK to `127.0.0.1` emulators, and a **fixture-login seam** ([apps/mobile/lib/auth/AuthContext.tsx](apps/mobile/lib/auth/AuthContext.tsx)) exposes `window.__cultuvillaE2E` for password sign-in without Google OAuth. **Security model:** both are gated by a single build-time `USE_FIREBASE_EMULATOR` flag set only in CI; the fixture-login additionally asserts at runtime that Auth points at a loopback emulator; and a `check:no-test-login-leak` grep gate (wired into `pnpm check` + CI) confines these symbols to three allowlisted files. Deploy workflows positively assert the flag is unset. A deployed build fails closed — it can't reach `127.0.0.1`, so the bypass cannot activate.
  - **Deterministic emulator fixtures** via a standalone `pnpm seed:e2e` ([scripts/seed/e2e.mjs](scripts/seed/e2e.mjs)) that builds a small, stable set (users + persons, an activated village, an approved org, an upcoming event) through the production model builders so it can't drift from schema. `scripts/seed/lib/context.mjs` gained an emulator mode targeting the dedicated `cultuvilla-test` project (never the real dev project).
  - **Playwright harness** under [apps/mobile/e2e/](apps/mobile/e2e/) — a dependency-free static server, a portable assertion layer that reads Firestore emulator state, and two flows: sign-up-to-an-event (asserting the registration lands in Firestore) and a deep-link render smoke.
- **Four more app-driven E2E flows + native (Maestro) groundwork** (see [docs/plans/ongoing/e2e-flows-and-native-groundwork.md](docs/plans/ongoing/e2e-flows-and-native-groundwork.md)). New Playwright flows over the web export, each asserting the backend effect in the Firestore emulator: onboarding (fresh user completes profile → `persons/{id}` + linked `users/{uid}`), create-&-publish event (organizer wizard → published `events/{id}`; a fake geolocation drives the location picker without a Google key), organizer-request → super-admin approval (`organizerRequests` → `approved` + requester promoted to village `admin`), and org create → village-admin approve → third-user join. The `emulatorState` reader layer and the `pnpm seed:e2e` fixture set grew to support them (super-admin, joiner and fresh users; an organizer-less village). **Native groundwork:** a manual, opt-in Maestro smoke ([apps/mobile/e2e/native/](apps/mobile/e2e/native/), `pnpm app:e2e:native`) runs the dev-client on an Android AVD against the emulator via the `10.0.2.2` host alias (new `EXPO_PUBLIC_EMULATOR_HOST` override on the connect seam) and deep-links into the seeded event — anonymous, so it needs no native login. Not in CI (no AVD there yet). **Flagged:** the org-join FAB currently writes the membership directly (`addOrgMember`) instead of the documented `requestJoinOrganization → respondToJoinRequest` round-trip; the join flow asserts that current behavior.
- **Scroll-to-top refresh on the web feed.** Both feeds already pull-to-refresh on native via `RefreshControl`, but that widget is inert on react-native-web, so the Firebase Hosting build had no refresh gesture. `useWebScrollTopRefresh` ([apps/mobile/lib/useWebScrollTopRefresh.ts](apps/mobile/lib/useWebScrollTopRefresh.ts)) attaches a `wheel` listener to each feed's scroll node and refetches when the user is already at the top and keeps scrolling up past a small threshold. Web-only (`Platform.OS === 'web'`), no-op on native; covered by jest tests.
- **Phone-number validation on event sign-up.** When an event requires a telephone, the attendee sheet now validates the number instead of only checking it's non-empty. A country-prefix selector (default 🇪🇸 +34) drives the rule: Spain requires 9 digits starting 6/7/8/9; other prefixes accept 4–14 digits. The prefix picker offers a **searchable, worldwide country list** (accent-insensitive name match + dial-code match), not a handful of curated countries. The invalid-number error appears **only after the user presses Confirmar** — not on every keystroke — so a half-typed number doesn't flash red. The number is stored in E.164 form (e.g. `+34600123456`). Logic lives in `@cultuvilla/shared/utils/phone` (`isValidPhoneNumber`, `formatPhoneE164`, `PHONE_COUNTRIES`, `parsePhoneE164`) with vitest coverage; the mobile `PhoneField` composes it. The **organizer-request flows** (start a village + "I want to organize", and request to organize an active village) now use the same `PhoneField`, validation, and E.164 storage via the shared `useOrganizerPhone` hook — replacing their plain non-empty check. The saved `profile.telephone` is parsed back into prefix + national on prefill (`parsePhoneE164`, which also tolerates legacy raw numbers). This changes the stored `users/{uid}.telephone` shape to E.164; the field is written only by these organizer screens and read nowhere else, so no backfill is needed (legacy raw values still parse for display).
- **Testing foundations** (first chunk of [docs/plans/ongoing/testing-enhancement.md](docs/plans/ongoing/testing-enhancement.md), inspired by the sibling `ordago-apps` repo):
  - **Report-only code coverage** across the monorepo — `@vitest/coverage-v8` in `packages/shared` + `functions`, Jest `v8` coverage in `apps/mobile`, and `vitest` newly wired into `packages/i18n`. Coverage is opt-in via `--coverage` (no CI gate yet — the plan gates on *patch* coverage later, never absolute total). New scripts: per-package `test:coverage` and a root `test:coverage:unit` aggregate.
  - **Shared emulator/rules test harness** at [packages/shared/test/helpers/rulesTestEnv.ts](packages/shared/test/helpers/rulesTestEnv.ts) (`useRulesTestEnv`/`createRulesTestEnv`) and [packages/shared/test/helpers/roles.ts](packages/shared/test/helpers/roles.ts) (`asUser`/`asAnon`/`asAdmin`/`seed`/`seedAdmin`). The 20 rules-e2e + integration tests were migrated off their copy-pasted `readFileSync(firestore.rules)` + `initializeTestEnvironment` + lifecycle boilerplate onto these helpers; `test/README.md` corrected to describe the real helpers (it previously referenced files that didn't exist).
  - **i18n key-parity tests** in [packages/i18n/test/](packages/i18n/test/) — cross-locale leaf-key parity (fails the moment a second locale drifts) and a static scan asserting every literal `t('...')` key used in `apps/mobile` (408 today, all resolving) exists in the catalog.
  - **Data-integrity invariant tests** at [packages/shared/test/validation/rulesShapeContract.test.ts](packages/shared/test/validation/rulesShapeContract.test.ts) — a pure, runnable cross-layer contract asserting each of the six create-gated model builders (`buildOrganizationData`, `buildOrgMemberData`, `buildOrganizationJoinRequestData`, `buildOccupationProposalData`, `buildPlaceData`, `buildBarrioData`) produces exactly the field set its `firestore.rules` `isValid*Create` validator permits, plus the shared pending/no-reviewer create defaults. Fails the moment a builder and its rule drift apart (a silent prod bug today).
  - **Coverage of two genuine gaps**: an e2e rules test for the `organizations/{orgId}` approve/reject **update** path (village-admin / app-admin allowed, member / outsider / anon denied) that `approveOrganization`/`rejectOrganization` rely on, and a `requestJoinOrganization` Cloud Function boundary test (unauthenticated / invalid / not-found / not-approved / already-member / duplicate / happy-path). The other request-type callables were already covered.
- **`apps/mobile/`** — Expo SDK 54 / Expo Router v4 / NativeWind v4 React Native scaffold. Consumes `@cultuvilla/shared` (services, design tokens, formatters) and `@cultuvilla/i18n` (message catalog). Firebase auth uses `getReactNativePersistence(AsyncStorage)` via the shared `customizeAuth` hook. v1 ships read flows: feed, event detail + register-to-event, villages list, village home, censo form, profile + photo upload, login/signup. EAS Build profiles `dev`/`beta`/`prod` match the existing Firebase env split. App Check seam wired (`initMobileAppCheck`) but no-op until product opts in. CI via `.github/workflows/mobile-ci.yml`. See [docs/decisions/mobile-app-scaffold.md](docs/decisions/mobile-app-scaffold.md).
- **Cloud Functions logging convention** documented in AGENTS.md: handlers use `logger.{info,warn,error}` from `firebase-functions/v2` with a structured second arg so Cloud Logging treats them as `jsonPayload` (searchable). The lone existing `console.*` call site (`onOccupationProposalApproved.ts`) was migrated.
- **Invariant test** at [functions/src/__tests__/helpers/no-console.test.ts](functions/src/__tests__/helpers/no-console.test.ts) — scans `functions/src/` and fails the build if any `console.*` call slips back in.
- **`registerToEvent` callable** at [functions/src/registerToEvent.ts](functions/src/registerToEvent.ts) runs the capacity-vs-waitlist decision and write in a Firestore transaction, replacing the client-side read-then-write batch that had a TOCTOU race. Writes `isMember` on each registration (denormalized from the village `members/` collection at write time) so attendee lists no longer need a per-user `isVillageMember` fan-out. Pure helpers under [functions/src/helpers/registerToEventValidation.ts](functions/src/helpers/registerToEventValidation.ts) for fast unit coverage.
- **Denormalized `confirmedCount` / `totalCount` on event docs**: `registerToEvent` writes them in the transaction; `onRegistrationDeleted` recomputes after delete + promotion. Lets feeds and event cards render attendee counts without an extra `getCountFromServer` round-trip. Pre-existing events get correct counts on the next registration write or cancellation.
- **Design system tokens** at [packages/shared/src/design-system/](packages/shared/src/design-system/) — spacing (4-based scale), typography (7 variants), semantic colors (light mode; dark added via `colors.dark` later), radii, elevation (web + RN shapes), z-index named layers, a11y constants (min touch target, default hit slop), icon sizes. See [packages/shared/src/design-system/README.md](packages/shared/src/design-system/README.md).
- **`@cultuvilla/i18n` workspace** at [packages/i18n/](packages/i18n/) — message catalog hoisted into its own workspace, consumed by the mobile app via the thin `useT()` adapter in `apps/mobile/lib/i18n.tsx`.
- **Locale formatting helpers** at [packages/shared/src/utils/format.ts](packages/shared/src/utils/format.ts) — `formatDate`, `formatPrice`, `formatRelativeTime`, all preset to `es-ES`.
- **App versioning + force-update gate**: semver marketing version (set at beta promotion, tagged on `main`), in-app version display on the profile screen, and a Firestore-backed (`config/appVersion`) force-update gate (`AppVersionGate` + `resolveVersionGate`, fail-open, no-op on web). OTA/EAS Update deferred to a follow-up.

### Changed
- **Security posture: any authenticated user can now list village/organization memberships** via the `members` collection-group `list` rule (previously scoped to the querying user). This powers the public user-profile screen's "villages" list; membership docs contain no sensitive data beyond role/village linkage.
- **Village location moved out of the activation flow.** Starting a village no longer asks for coordinates or a map — activation is now just the optional escudo plus the "I want to organize" toggle. Location is set afterwards by an admin: when a village has no coordinates, its home shows a dashed "Añadir ubicación" placeholder (in the map's footprint, mirroring the create-event/article cards) that opens the organizer's *Detalles* editor, where the location picker already lives. The `startVillage` callable/service no longer accept `coordinates`/`mapZoom`; location writes go solely through the admin-only `updateMunicipality` edit path.
- **Generalized the `cemeteries` municipality subcollection to `places`** discriminated by a `kind` enum (`cemetery`, `church`, `hermitage`, `plaza`, `town_hall`), so notable village sites beyond cemeteries reuse one stack. `Person.burialPlace` now carries `{ municipalityId, placeId }` (was `cemeteryId`) and references a place with `kind === 'cemetery'`. The mobile admin screen is now `places.tsx` with a kind picker. Dev-phase change — data is wiped and recreated, no migration. Barrios remain a separate concept (administrative subdivisions, not physical sites).
- **CI: Java 17 → 21** for the emulator-tests job. `firebase-tools@15` will drop support for Java < 21; bumping ahead of the deprecation removes the runtime warning and keeps the job working when firebase-tools rolls forward.
- **Shared Firebase init is now config-injected** ([packages/shared/src/firebase/firebaseApp.ts](packages/shared/src/firebase/firebaseApp.ts)). Apps call `initFirebase(config, opts?)` once at startup and consume `getDb()`, `getAuth()`, `getFirebaseStorage()`, `getFirebaseFunctions()`, `getFirebaseApp()` accessors. The previous `process.env.NEXT_PUBLIC_*`-baked singleton was a hard blocker for the React Native app (Expo doesn't expose those env vars and RN needs `getReactNativePersistence` for auth). The mobile app initializes it at bootstrap and passes a `customizeAuth` hook to register `initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })`.
- **`firebase` moved from `dependencies` to `peerDependencies`** in `@cultuvilla/shared`, so the consuming app owns the SDK instance and Metro/Next don't end up with two copies in a monorepo.
- **`imageService` is now `Blob`-based**: `uploadMunicipalityImage` and `uploadPersonImage` accept `{ blob, filename, contentType? }` instead of a web `File`. Mobile consumers pass a `Blob` obtained via `pickImageAsBlob`.
- **`registerToEvent` is now a callable wrapper** in [packages/shared/src/services/registrationService.ts](packages/shared/src/services/registrationService.ts). Drops the legacy client-side `getConfirmedCount` + `writeBatch` path. Signature changed from `(eventId, inputs, maxAttendees)` to `(eventId, registrants)`; `userId` is read from `request.auth.uid` server-side and no longer accepted in the input.
- **Firestore rules**: `events/{eventId}/registrations/{regId}` `allow create: if false` — the callable is the only sanctioned write path.
- **`useRegistrations`** drops the separate `getConfirmedCount` round-trip and derives `confirmedCount` from the already-loaded registration list. Event detail page reads `reg.isMember` directly, eliminating the O(N) `isVillageMember` fan-out on each view.

### Fixed
- **Tall flyers on event/feed cards now crop from the top instead of the middle.** React Native's `Image` with `resizeMode="cover"` always centre-crops, so a portrait poster lost its header (title/date usually live up top) equally to its footer. A new [TopCropImage](apps/mobile/components/primitives/TopCropImage.tsx) primitive measures the natural aspect ratio (via `Image.getSize`), scales to cover, and pins the picture to the top edge (centred horizontally); landscape/square images are unaffected. Applied to the shared village/profile card (`BigCard` in [VillageSections.tsx](apps/mobile/components/feature/VillageSections.tsx)) and the Explora/registrations feed card ([FeedCard.tsx](apps/mobile/components/feature/FeedCard.tsx), covering both event and news cards).
- **Invite links ("Invitar vecino" / org invite) opened the not-found screen on the web build.** Content share links (`/event/<id>`, `/village/<id>`) each map 1:1 to a route file, but the invite URLs `/village/<id>/join` and `/o/<id>/join` had none — so on web, where expo-router resolves URLs by file route, they fell to the unmatched screen (the native-oriented `Linking` listener in `useDeepLinkRouter` doesn't drive web routing). Added real routes ([apps/mobile/app/village/[villageId]/join.tsx](apps/mobile/app/village/[villageId]/join.tsx), [apps/mobile/app/o/[orgId]/join.tsx](apps/mobile/app/o/[orgId]/join.tsx)) that redirect into the target carrying `intent=join`, rendering the "invited" banner. The org route file `o/[orgId].tsx` became `o/[orgId]/index.tsx` to host the nested `join` segment. Regression covered by a new Playwright deep-link-invite flow.
- **Village location (and description) silently failed to save in the community editor.** The community "Editar" Stepper renders one step at a time, but the `CommunitySettingsEditor` (its first "Detalles" step) deferred its save to the Stepper's final "Listo" button via an imperative `editorRef.current?.save()`. By the time the last step is reached the editor is unmounted, so the ref is `null` and the `?.` made `save()` a silent no-op — coordinates and description were never written, with no error shown (only the escudo, which saved on pick, worked). Each field now saves immediately while mounted: location/zoom on change, description on blur, matching the escudo. Errors surface via an alert instead of failing silently. Regression covered by a new jest test asserting a picked location persists immediately.
- **Explora feed dropped same-day and in-progress events.** `getUpcomingFeed` filtered `startDate >= now`, so an event that had already started today (or a multi-day event mid-run) vanished from Explora even though the rest of the system still treats it as live — `completeExpiredEvents` only flips an event to `completed` once its *last day* is over (`isEventOngoing` / `eventEndBoundary`). Events now carry a derived `endBoundary` field (`endDate ?? startDate`), written by `buildEventData` and recomputed in `updateEvent`; the feed ranges/orders on `endBoundary >= startOfToday` instead, so events stay visible for the whole of their (last) day and drop out only once the scheduler completes them. New composite index `events (status, endBoundary)`; rules require and validate `endBoundary`; existing dev docs backfilled via `scripts/backfill-event-endboundary.mjs`.
- **Profile creation no longer crashes on the read right after submit.** `UserDataSchema.displayName` is a denormalized projection written only by the async `syncPersonDenormalization` trigger; `createUserProfile` omits it, so a read in the window before the trigger lands (`refreshProfile()` in onboarding) hit a doc with no `displayName` and the strict converter threw `expected string, received undefined`. The schema now uses `z.string().default('')`, so such a read degrades to `""` (matching the field's documented contract) and self-heals once the trigger propagates. Regression covered by a new `userConverter` round-trip test of the exact displayName-less payload.

### Removed
- **`apps/web/` (Next.js App Router web app) deleted** in favor of `apps/mobile/` (Expo + React Native, which also serves the web build via React Native Web). The design tokens, primitives, i18n catalog, and config-injected Firebase init that were originally built web-first now live in / are consumed by the mobile app. See [docs/architecture/web-deletion-missing-screens.md](docs/architecture/web-deletion-missing-screens.md) for the screens still to be reimplemented on mobile.

### Notes for deploy
- Pre-existing events have no `confirmedCount` / `totalCount` until the next registration write or cancellation triggers a recompute. UIs that need these counts before that should fall back to a count query (or run a one-shot backfill).
- Pre-existing registrations have no `isMember`. The event detail page treats missing as `false` (shown as "Visitante"). A backfill helper can be added in a follow-up if needed.

## 2026-05-19 — Workflow conventions (PR #2)

### Changed
- **AGENTS.md** now codifies the development workflow: work in a git worktree (not in the main checkout), add tests whenever possible, open a pull request (not direct-to-main), wait for explicit user confirmation before merging, **rebase the branch onto the latest `main` (and re-run CI) before merging**, and **merge with a merge commit** (`gh pr merge --merge`) rather than squash or rebase-merge so the per-commit scope is preserved. The "things to flag in PRs" list grew two entries: untested code changes and work that landed outside a worktree.

## 2026-05-19 — Ordago-apps conventions uplift (PR #1)

### Added
- **AGENTS.md** at repo root: load-bearing conventions for human and AI contributors (service-layer ownership, denormalization pattern, strict TS, no `any`, conventional commits, delete > deprecate).
- **Services map** at [packages/shared/src/services/_services-map.md](packages/shared/src/services/_services-map.md): canonical list of every Firebase-touching service, the collection it owns, and key entry points. Also documents denormalized fields and their syncing triggers.
- **Denormalized read-model pattern doc** at [docs/architecture/denormalized-read-models.md](docs/architecture/denormalized-read-models.md): when to denormalize, the canonical trigger structure, failure modes, and the checklist for adding a new denormalized field.
- **Pre-commit hygiene**: Husky + lint-staged + commitlint. Pre-commit runs `eslint --max-warnings 0 --fix` on changed `apps/web` TypeScript files. Commit-msg enforces conventional commits with a 100-char header limit.
- **ESLint `no-restricted-imports`** in `apps/web`: blocks direct `firebase/firestore`, `firebase/storage`, `firebase/functions`, and `firebase/auth` imports outside the documented auth boundary. `GeoPoint`, `Timestamp`, and the `User` type are now re-exported from `@cultuvilla/shared/firebase`.
- **ESLint `@typescript-eslint/no-explicit-any: error`** in `apps/web`: no `any` allowed; use `unknown` or a precise type. (Pre-emptive: cultuvilla had no `any` in `apps/web` source before this rule landed.)
- Tests for the new firebase re-exports and apps/web ESLint rules under `packages/shared/test/firebase/` and `packages/shared/test/eslint/`.

### Changed
- `pnpm web:lint` (and the root `pnpm lint`) now runs `eslint . --max-warnings 0`. Warnings break the build.
- `@next/next/no-img-element` disabled with an inline justification: `next.config.ts` sets `images.unoptimized = true`, which makes `<img>` and `next/image` equivalent, and Firebase Storage signed URLs would require `remotePatterns` upkeep.
- Two pre-existing unused-import warnings in `apps/web` fixed so `--max-warnings 0` could land cleanly.

### Notes for future work
The following items from the ordago-apps uplift survey were proposed but not landed:
- Firebase Emulator Suite + vitest integration tests.
- Multi-environment Firebase setup (dev / beta / prod).
- Sentry on the web app; structured logging in Cloud Functions.
- `react-hook-form` + `zod` for forms.
- TanStack Query (or SWR) for a data-fetching cache.
- Global error boundary.

## 2026-05-17 — Renamed to Cultuvilla
- Project renamed from `villa-events` to `cultuvilla`. Live repo at `/home/powervaro/githubs/cultuvilla`. Shared package alias is `@cultuvilla/shared`. Firebase project ID remains `villa-events` for continuity with live data.
- Added `vitest` to `packages/shared` with model tests; added `pnpm check` aggregating lint + typecheck + test + build.
- Added GitHub Actions CI workflow that runs the same gate on push to main and PRs.

## 2026-05-13 — Superadmin pages and occupation taxonomy
- Superadmin pages for municipalities, barrios, cemeteries, occupations, and proposals.
- Person form now picks municipality / barrio / cemetery and offers a multi-select for occupations with a proposal flow (`occupationService.proposeOccupation`).
- Cloud Function auto-promotes pending occupation proposals on approval; proposer `displayName` shown in the admin proposals page.
- Seed script for the Spanish INE municipalities dataset (provincial capitals) under `scripts/seed-municipalities.mjs`.

## 2026-04-29 — Open feed
- Cross-village upcoming feed via Firestore collection group queries with optional haversine "nearby" filter.
- Village denormalization trigger that propagates `name`, `images[0]`, and `coordinates` from each `villages/{vid}` document onto its events (`villageName`, `villageCoverImage`, `villageCoordinates`).

## 2026-04-25 — Village censo
- Village censo (per-village profile schema) defined in `packages/shared/src/models/village/CensoTypes.ts`.
- `updateCensoSchema` Cloud Function performs schema-transition validation (duplicate keys, unknown predefined fields, invalid custom keys); `saveProfileAnswers` writes user answers and marks `profileCompletedAt` when all required fields are present.

## 2026-04-05 — Initial platform design
- Single Firebase project; data nested under `villages/{villageId}/`; collection group indexes for cross-village queries.
- Six user types (anonymous visitor, authenticated user, village member, org member, village admin, superadmin) and three org types (ayuntamiento, peña, asociación).
- Persona model: up to 50 proxy profiles per user for family-member sign-ups (renamed from `personas/` to `persons/` collection later that month).
- Next.js App Router web app under `apps/web`; shared types and services under `packages/shared`; Cloud Functions under `functions/`.
- Spanish default with `next-intl`; WhatsApp notifications deferred to later.
- Initial Cloud Functions: `acceptInvite`, `waitlistPromotion`, `eventCompletion`, `notificationTriggers`.

---

For commit-level history see `git log`. For design rationale see [docs/decisions/](docs/decisions/).
