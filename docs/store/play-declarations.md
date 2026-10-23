# Google Play — App content declarations

Answers for every item under **Play Console → Policy → App content**, plus the
store settings that sit next to them. Each answer is a claim about the shipped
binary; the "source" column is what to re-read before changing it.

| Declaration | Answer | Source |
|---|---|---|
| Privacy policy | `https://cultuvilla.es/legal/privacidad` | [docs/legal/politica-de-privacidad.md](../legal/politica-de-privacidad.md) → [apps/mobile/app/legal/privacidad.tsx](../../apps/mobile/app/legal/privacidad.tsx) |
| App access | **Parts restricted** — credenciales de prueba obligatorias | ver abajo |
| Ads | **No contiene anuncios** | sin SDK de publicidad en [apps/mobile/package.json](../../apps/mobile/package.json) |
| Content rating | Cuestionario → categoría **Social / UGC** | ver abajo |
| Target audience | **18+** (público objetivo declarado); edad mínima de registro 14 | `MIN_SELF_REGISTRATION_AGE = 14` |
| Data safety | ver tabla completa abajo | modelos `users` / `persons`, `blockedPermissions` |
| Government apps | **No** — Cultuvilla no está desarrollada por ni en nombre de una administración pública | — |
| Financial features | **Ninguna** — sin pagos, sin compras in-app, sin criptoactivos | no existe campo `price` en el modelo de evento |
| Health | **No** — sin funciones de salud, sin investigación clínica, sin seguimiento físico | — |

## App access (sign-in details)

El contenido es **legible sin cuenta** (guest browsing, ver
[docs/decisions/guest-browsing.md](../decisions/guest-browsing.md)): eventos,
noticias, pueblos y organizaciones se ven sin iniciar sesión. La sesión sólo se
exige para **actuar** — inscribirse a un evento, unirse a una organización,
publicar contenido, administrar.

Aun así hay que declarar **"Todas o algunas funciones están restringidas"** y
dar instrucciones, porque el revisor no puede evaluar la mitad de la app sin
cuenta.

**Decidido: cuenta de revisión con código fijo.** El acceso es (a) código OTP de
6 dígitos por email o (b) Google Sign-In, así que ninguna credencial suelta
sirve: el OTP exige acceso al buzón. Las dos alternativas se descartaron —
exponer `signInWithEmailAndPassword` sólo para la review añade una superficie de
autenticación real por una necesidad de trámite, y entregar la contraseña de un
buzón real deja esa credencial guardada en la consola y replayada en cada
revisión de cada actualización.

En su lugar, **una** dirección en lista blanca recibe un código de 6 dígitos que
no rota, y el revisor no abre ningún buzón. El par vive en
`_admin/reviewAccess` (denegado a todo cliente en las reglas), no en git ni en
Secret Manager, y se escribe por entorno:

```bash
node scripts/set-review-access.mjs --env=prod --email=<dirección> --confirm
node scripts/set-review-access.mjs --env=prod --clear --confirm   # al terminar
```

`sendAuthOtpCode` escribe el hash de ese código fijo en el mismo doc de
`authOtpCodes` donde iría uno aleatorio y se salta el envío; `verifyAuthOtpCode`
no cambia. Siguen aplicándose la caducidad de 10 minutos, el tope de 5 intentos
y el límite de 5 envíos cada 15 minutos, que es lo que mantiene un código que
nunca rota fuera del alcance de la fuerza bruta.

Preparación de la cuenta (hacer **antes** de rellenar el formulario):

1. La dirección debe existir ya como usuario en el entorno de destino. El script
   avisa si no, porque `verifyAuthOtpCode` crearía una cuenta nueva al primer
   acceso — y una cuenta recién creada no está en ningún pueblo.
2. Dejarla como **usuaria normal**, no app admin. El revisor no necesita las
   pantallas de administración y exponerlas invita preguntas. Un código fijo
   sobre una cuenta con autoridad sería una decisión distinta: lo que hace
   asumible el riesgo es que la identidad no puede hacer nada que no pueda hacer
   cualquiera que se registre.
3. **Revocar con `--clear` cuando termine la revisión.** El código sólo merece su
   riesgo mientras un revisor lo necesita.

Lo que va en cada campo de Play Console → App access → "Add sign-in details":

| Campo | Valor |
|---|---|
| Name (≤60) | `Test user account (village member)` |
| Username / email (≤100) | la dirección en lista blanca |
| Password | el **código fijo de 6 dígitos** — la app no tiene contraseña |
| All functionality accessible | sí (una cuenta normal alcanza todo lo que puede hacer una persona usuaria) |

Instrucciones (el formulario exige **inglés**):

```
Most of the app works without an account: events, news, villages and
associations are public. An account is only needed to sign up for an event,
join an association, publish content, or report or block a user.

The app has no password. Sign-in is a 6-digit code sent by email. For this
review account the code is fixed, so you do not need to open a mailbox.

1. Open the app and tap "Entrar" (Sign in).
2. Enter the email address above and tap "Enviar codigo".
3. Type the code above into the app.

Google Sign-In is also offered on that screen; please use the email code instead.

The app interface is in Spanish.
```

**El texto es la parte que sostiene el trámite.** Un revisor con sólo un email y
una contraseña, en una app sin campo de contraseña, lo intenta, falla y rechaza
por "cannot access app". No recortar los tres pasos. Las mismas credenciales y
el mismo texto valen para App Store Connect → App Review Information.

## Content rating

Cuestionario (IARC). Respuestas que se derivan del código:

- **Categoría**: Red social / con contenido generado por usuarios.
- **Contenido generado por usuarios**: **Sí** — comentarios (`EntityComments`),
  noticias, biografías de perfil, imágenes subidas.
- **Interacción entre usuarios**: **Sí** — comentarios y menciones.
- **Compartir ubicación con otros usuarios**: **No** — la ubicación se usa una
  sola vez para fijar el pin del pueblo, no se comparte la del usuario.
- **Compartir información personal**: **Sí** — el perfil (nombre, foto, pueblo)
  es visible para otras personas usuarias.
- Violencia, sexo, lenguaje soez, drogas, apuestas, compras: **No**.

**Herramientas de moderación** (lo que el cuestionario pregunta a continuación):

- **Denuncia dentro de la app**: sí — bandera en cada comentario ajeno, siete
  motivos, escribe en `contentReports/`.
- **Bloqueo de personas usuarias**: sí — desde la misma hoja; se deshace en
  Ajustes → Personas bloqueadas.
- **Revisión por parte de administradores**: sí — Administración → Denuncias
  (cola de denuncias abiertas del pueblo) y ocultación de contenido vía
  `setContentVisibility`, con registro de auditoría en `moderationEvents/`.
- **Contacto de moderación**: `cultuvilla.app@gmail.com`.

## Target audience and content

- Grupos de edad seleccionados: **18 y más**. Aunque los Términos permiten el
  registro desde los 14, declarar cualquier franja por debajo de 18 activa
  Families Policy (política de diseño para menores, consentimiento parental
  verificable, revisión adicional) — desproporcionado para esta app.
- ¿Atrae a menores por su aspecto? **No.**
- Google Play SDK Index: sin SDKs de terceros que traten datos de menores.

## Data safety

Recogida y **no compartida** en todos los casos: los datos viven en Firebase
(Google Cloud, encargado del tratamiento), no se venden ni se ceden a terceros
con fines propios.

| Tipo (categoría Play) | Recogido | Obligatorio | Finalidad | Origen en el código |
|---|---|---|---|---|
| Personal info → Name | Sí | Sí | App functionality, Account management | `persons` (nombre y apellidos) |
| Personal info → Email address | Sí | Sí | Account management, autenticación | Firebase Auth |
| Personal info → Phone number | Sí | No | App functionality | perfil, campo opcional |
| Personal info → Other info | Sí | No | App functionality | fecha y lugar de nacimiento, sexo, biografía |
| Photos and videos → Photos | Sí | No | App functionality | foto de perfil, escudo, imágenes de evento/noticia |
| Location → Approximate + Precise | Sí | No | App functionality | `expo-location`, una sola vez, para el pin del pueblo |
| App activity → Other actions | Sí | No | App functionality | inscripciones, pertenencias, solicitudes |
| App info and performance → Crash logs | Sí | No | Diagnóstico | `captureError` → Cloud Logging |
| App info and performance → Diagnostics | Sí | No | Diagnóstico | mismo puente de errores |

Prácticas de seguridad a declarar:

- **Cifrado en tránsito**: sí (HTTPS/Firebase en todo el camino).
- **Se puede solicitar la eliminación de los datos**: sí — Ajustes → Eliminar
  cuenta (callable `deleteAccount`, borrado RGPD).
- **URL de solicitud de eliminación**: `https://cultuvilla.es/legal/eliminar-cuenta`.
- **Sin SDK de analítica de terceros en nativo**: el backend de analítica de
  `apps/mobile/lib/observability/analytics.ts` es hoy un no-op; los errores van
  a Cloud Logging propio. Si se activa `@react-native-firebase/analytics`,
  esta tabla cambia (Device or other IDs pasa a recogerse).

### Permisos del manifiesto

`ACCESS_COARSE_LOCATION` y `ACCESS_FINE_LOCATION` (uso puntual) y lectura de la
fototeca vía selector del sistema. Bloqueados en
[apps/mobile/app.config.ts](../../apps/mobile/app.config.ts):
`ACCESS_BACKGROUND_LOCATION`, `CAMERA`, `RECORD_AUDIO`,
`READ_EXTERNAL_STORAGE` y los de lectura de medios (`READ_MEDIA_IMAGES`,
`READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`, que
trae `expo-media-library` y que la política de fotos y vídeos de Play restringe).
Desbloquear cualquiera de ellos obliga a rehacer el formulario de Data safety
(y, en el caso de background location, a una declaración escrita más un vídeo
de revisión).

`WRITE_EXTERNAL_STORAGE` **sí** está declarado (Android lo ignora desde la 13): guardar
una imagen del resumen de fiestas en la galería lo necesita por debajo de
Android 13. Solo escribe en el dispositivo y no envía nada fuera, así que no es
recogida de datos y no cambia Data safety.

## Store settings

- **Categoría de la app**: Estilo de vida.
- **Etiquetas**: eventos, comunidad, pueblo.
- **Datos de contacto**: `cultuvilla.app@gmail.com`, `https://cultuvilla.es`.
- **Aplicación gratuita** — no se puede cambiar a de pago después.
- **Países**: España (ampliable después sin re-review).
