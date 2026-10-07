# Cultuvilla — Reglas de negocio

La única fuente de verdad sobre **qué permite y qué prohíbe el producto** — las
reglas que gobiernan a los usuarios, los pueblos, los eventos y el contenido.
Complementa, y donde discrepan prevalece sobre, el texto de
[README.md](../README.md) y el razonamiento por funcionalidad de
[docs/decisions/](decisions/).

> **Alcance de este documento:** las *reglas*, no la implementación. Cuando una
> regla discrepa hoy del código, se señala en
> [§13 Discrepancias conocidas](#13-discrepancias-conocidas-a-reconciliar). Los
> puntos aún en debate están en [§11 Preguntas abiertas](#11-preguntas-abiertas)
> y [§12 Diferido](#12-diferido-en-otras-ramas).

---

## 1. Glosario y entidades centrales

| Término | Significado | Dónde vive |
|---|---|---|
| **Municipio** (*Municipality*) | Un *ayuntamiento* español fijo y predefinido. Siempre existe como documento de referencia, lo use o no alguien en la app. | `municipalities/{id}` |
| **Comunidad** (*Community*) | La *capa* activable sobre un municipio. Se activa cuando alguien organiza el pueblo. **Una comunidad por municipio.** | `municipalities/{id}.community` |
| **Pueblo** (*Village*) | Palabra coloquial para *un municipio con una comunidad activa*. No es una entidad aparte. | — |
| **Persona** (*Person*) | Un registro de identidad canónico (nombre, apellidos, sexo, fecha y lugar de nacimiento, biografía, foto). La unidad a la que apunta una inscripción. | `persons/{personId}` |
| **Cuenta de usuario** (*User account*) | Metadatos de cuenta de un usuario autenticado (nombre visible, email, teléfono, pueblo activo, enlace a su propia Persona). | `users/{uid}` |
| **Organización** (*Organization*) | Un *ayuntamiento*, *peña* o *asociación*. Pertenece a exactamente un municipio. | `organizations/{orgId}` |

**Persona vs. cuenta de usuario.** Cada usuario tiene su **propia Persona**
(`users/{uid}.personId`, donde esa Persona tiene `userId == uid`). Un usuario
también puede crear **Personas adicionales para familiares** (`userId == null`,
`createdBy == uid`) para inscribir a miembros de la familia. «Persona» en
documentos antiguos = un registro Person; **no** es un tipo de usuario.

**Pueblo = municipio + comunidad.** No existe una colección `villages/`; la
colección canónica es `municipalities/`. «Pueblo» es solo una etiqueta humana
para un municipio cuyo `community.active == true`.

---

## 2. Tipos de usuario y roles

Los roles **se componen**: un miembro de organización es también miembro del
pueblo y también un usuario autenticado.

| Rol | Definido por | Capacidad principal |
|---|---|---|
| **Visitante anónimo** | sin sesión iniciada | Explora eventos públicos y noticias visibles (`status: 'active'`). Ve **solo recuentos** de asistentes, nunca nombres. |
| **Usuario autenticado** | con sesión iniciada | Todo lo anterior + inscribirse a **cualquier** evento de **cualquier** pueblo, gestionar su cuenta y Personas, publicar/comentar/reaccionar en noticias. |
| **Miembro del pueblo** | `municipalities/{id}/members/{uid}` (`role: user`) | Miembro de un pueblo concreto. Ve los **nombres** de asistentes en los eventos de ese pueblo. Sujeto al censo de ese pueblo. |
| **Equipo del pueblo** (y su **Embajador**) | `municipalities/{id}/members/{uid}` (`role: admin`) | Gestiona el pueblo: expulsa miembros, modera noticias, gestiona barrios/cementerios, edita/cancela cualquier evento del pueblo, aprueba solicitudes de creación de organizaciones. *(El ingreso es autoservicio — el administrador ya no lo aprueba.)* |
| **Miembro de organización** | `organizations/{orgId}/members/{uid}` | Crea/gestiona los eventos de esa organización. |
| **Superadministrador** | `admins/{uid}` | Global. Crea municipios, aprueba solicitudes de embajador, gestiona los datos de referencia y tiene plenos poderes de administrador de pueblo en todas partes. |

**Un Embajador por pueblo, un equipo detrás.** En la app, el rol `admin` se
presenta así (ver [decisions/embajador-title.md](decisions/embajador-title.md)):

- **Embajador / Embajadora de Cultuvilla** — el único admin al que apunta
  `community.organizerId`. Es un título **público**: su nombre y foto aparecen en
  la página del pueblo y en su perfil. «Embajadora» sale automáticamente del
  `sex` de su persona (`community.organizerSex`).
- **Equipo del pueblo** — cualquier otro admin: los mismos permisos, sin título.

El equipo puede añadir o quitar miembros del equipo; solo el Embajador (o un
superadministrador) puede **ceder el título** a otro miembro
(`transferVillageAmbassador`), que pasa a admin si no lo era. El Embajador saliente
sigue en el equipo. Al Embajador no se le puede quitar del equipo sin ceder antes
el título.

**Multipueblo.** Un usuario puede ser miembro (o administrador) de **varios
pueblos a la vez**. `activeMunicipalityId` en la cuenta selecciona en qué pueblo
se centra la interfaz — es **solo una pista de UI, nunca un mecanismo de control
de acceso** (tolerar `null`).

---

## 3. Hacerse miembro de un pueblo y darse de baja

Tres capas independientes — **pertenecer**, **iniciar** y **organizar** — en
lugar de un único acto «organizar». La activación está **desacoplada** del rol
de administrador.

### 3.1 Unirse a un pueblo activo (autoservicio)

Cualquier usuario autenticado se añade como miembro (`role: user`) de un pueblo
con **comunidad activa**, sin aprobación. La pertenencia se crea al instante; la
app muestra antes una confirmación que deja claro que unirse es una
**autodeclaración** («este es mi pueblo») y **no verifica residencia**. La
membresía se escribe directamente desde el cliente y la salvaguarda se aplica en
las **reglas de Firestore**: solo el propietario, sobre comunidad activa, con
`role: user`. Estar ya inscrito lo impide la semántica de `create`. **No existe
cola de solicitudes de ingreso.**

También: **token de invitación** — un administrador comparte un token; el usuario
lo canjea. *(Reglas diferidas — ver [§12](#12-diferido-en-otras-ramas).)*

### 3.1b Iniciar un pueblo dormido (activación, autoservicio)

Un municipio sin comunidad se **inicia** con el callable `startVillage`:
cualquier usuario lo activa (crea `community` con `organizerId: null`,
`communityActive: true`) y queda como su **primer miembro**. Iniciar **no**
convierte en Embajador. Mientras `community.organizerId == null` (sin
Embajador todavía — *fase wiki*), **cualquier miembro** puede editar la
información básica (descripción e imágenes) vía el callable `updateVillageInfo`;
cuando se nombra un Embajador, esa edición se consolida en el equipo del
pueblo.

### 3.1c Ser Embajador (aprobado)

Un miembro de un pueblo **activo y sin Embajador** solicita serlo
(`requestOrganizeVillage`, solo motivación); un **superadministrador aprueba**
(`respondToOrganizerRequest`). La aprobación **no crea la comunidad** (ya existe):
fija `community.organizerId` (y `organizerSex`) al solicitante y lo promueve a
`role: admin`. Las solicitudes de Embajador siguen pasando por Cloud Functions; la **membresía** y
el **inicio** del pueblo, en cambio, son escrituras gobernadas por reglas /
callables sin aprobación.

### 3.2 Modelo de confianza

**No hay verificación de residencia real.** «Miembro del pueblo» es una relación
a nivel de app que el usuario establece por **autodeclaración** al unirse a un
pueblo con comunidad activa (o mediante una invitación válida) — ya **no**
requiere aprobación del administrador. Los campos de residencia del censo son
**autodeclarados y no verificados**.

### 3.3 Darse de baja

- Un miembro puede **darse de baja voluntariamente**; un **administrador del
  pueblo puede expulsar** a un miembro.
- Al salir: las **inscripciones futuras del miembro se cancelan** (liberando
  plazas) y sus **respuestas del censo se eliminan**.
- El **último administrador debe promover a otro administrador antes de irse**.

---

## 4. El censo (formulario de perfil por pueblo)

- El administrador de cada pueblo define un **censo** — un formulario de perfil
  que captura información específica del pueblo (barrio, tipo de residencia,
  hogar, …). El esquema es **de lectura pública**; las respuestas solo las ven
  el propio vecino, el equipo del pueblo y los administradores de la app.
- **Solo para miembros.** El censo es el padrón del pueblo sobre *sus propios
  miembros*. Las respuestas de un miembro viven en `censoAnswers/{pueblo}_{uid}`;
  su documento de membresía solo guarda si lo ha completado
  (`profileCompletedAt`). **Los visitantes no tienen censo.**
- **Relleno diferido, exigido en la primera inscripción.** Unirse nunca solicita
  el censo. A un miembro que no haya completado los campos obligatorios se le
  **fuerza a rellenarlo la primera vez que se inscribe** a un evento de ese
  pueblo; la comprobación se aplica **en el servidor**, la redirección del
  cliente es una comodidad.
- Los **campos** son **predefinidos** (de un registro en código con claves
  estables entre pueblos) o **personalizados** (locales del pueblo, definidos por
  el administrador).
- **Solo se añade tras la primera respuesta:** un campo solo puede eliminarse
  mientras ningún miembro lo haya respondido; las opciones de un desplegable
  pueden añadirse pero no eliminarse una vez seleccionadas; el `type` y la `key`
  del campo son inmutables.

Ver [docs/decisions/village-censo.md](decisions/village-censo.md).

---

## 5. Personas (registros de identidad)

- Una Persona es **solo del propietario**: solo su `createdBy` puede leerla,
  escribirla o eliminarla.
- Un usuario tiene **una Persona propia** (`userId == uid`) y puede crear
  **cualquier número de Personas-familiar** (`userId == null`). **Sin límite.**
- Las **inscripciones siempre apuntan a una Persona** que el usuario que inscribe
  posee (él mismo o un familiar). No hay inscripción anónima/sin nombre.
- **Eliminar una Persona es en cascada** — sus inscripciones a eventos también se
  eliminan (liberando plazas y disparando la promoción de la lista de espera). No
  existe «bloquear el borrado mientras esté inscrita».
- Las Personas autónomas no vinculadas a una cuenta (p. ej. ancestros fallecidos
  para un futuro árbol genealógico) están permitidas por el modelo pero no son
  una superficie de producto en v1.

Ver [docs/decisions/persons-registry.md](decisions/persons-registry.md).

---

## 6. Organizaciones

- **Tipos:** `ayuntamiento`, `peña`, `asociación`.
- **Creación — solicitud → aprobación (ya implementado):** un miembro del pueblo
  envía una organización con `status: 'pending'` (`requestOrganization` en
  `organizationService`); un **administrador del pueblo** (o superadministrador)
  la aprueba o rechaza (`approveOrganization` / `rejectOrganization`). El propio
  documento de la organización lleva el estado de la solicitud (`status`,
  `requestedBy`, `approvedBy`, `decidedAt`) — no hay colección de solicitudes
  aparte.
- **Cardinalidad:** **un `ayuntamiento` por pueblo; `peña` / `asociación`
  ilimitadas.** El límite de ayuntamiento lo aplica el callable
  `requestAyuntamiento` — una transacción rechaza un segundo *pendiente o
  aprobado* (una solicitud previa *rechazada* libera el hueco). `peña` /
  `asociación` se siguen creando desde el cliente.
- **Membresía de organización:** cada organización tiene sus propios
  **administradores** que invitan/aprueban miembros. **Los miembros de la
  organización crean y gestionan los eventos de esa organización.**
- **Una organización pertenece a un pueblo.** Las organizaciones multipueblo son
  explícitamente futuras (añadirían `villageIds[]` / `parentOrgId`).

---

## 7. Eventos

### 7.1 Identidad y alcance

- Un evento ocurre en **exactamente un pueblo** (`municipalityId` = la ubicación),
  sin importar cuántas personas u organizaciones co-organicen.
- **Sin concepto de precio / pago.** El dinero nunca se menciona de forma nativa
  en la app; cualquier coste lo gestiona el organizador fuera de la app. (El campo
  `price` se ha eliminado del modelo de evento.)

### 7.2 Quién crea y a quién se atribuye

- **Cualquier miembro del pueblo del evento puede crear un evento** allí.
- Los **organizadores de un evento son un conjunto**: cero o más **usuarios** y
  cero o más **organizaciones**. El **creador siempre es organizador**. Formas
  válidas: solo-él, solo-nombre(s)-de-organización, o él + organización(es);
  pueden co-organizar varios usuarios *y* varias organizaciones.
- **Los co-organizadores deben pertenecer al mismo pueblo que el evento.**
  Cualquier miembro de ese pueblo puede añadir a cualquier otro miembro, o a
  cualquier organización de ese pueblo, como co-organizador — **sin paso de
  consentimiento ni aprobación.**

> **Estado:** el *conjunto* de organizadores es el modelo objetivo; el código hoy
> almacena un único `organizationId` (una organización por evento). La migración
> está planificada en [event-co-organizers](plans/ready/event-co-organizers.md) —
> ver [§13](#13-discrepancias-conocidas-a-reconciliar).

### 7.3 Ciclo de vida

```
draft ── publicar ──▶ published ── cancelar ──▶ cancelled   (terminal)
                          │
                          └── automático (al pasar las fechas) ──▶ completed
```

- **Lineal y en un solo sentido.** No hay despublicar ni reabrir; **cancelar es
  terminal**.
- `completed` se asigna **automáticamente** cuando pasa `startDate`/`endDate`
  (tarea programada).
- **Los borradores (`draft`) solo son visibles para los organizadores del evento.**

### 7.4 Permisos de edición y cancelación

Editar o cancelar un evento lo pueden hacer:
- cualquier **usuario co-organizador**, o
- cualquier **miembro de una organización co-organizadora**, o
- un **administrador del pueblo** del evento, o
- un **superadministrador**.

Editar un evento publicado con inscritos:
- cambiar **título / fecha / ubicación** notifica a todos los inscritos
  (`event_updated`);
- **cancelar** notifica a todos los inscritos (`event_cancelled`).

---

## 8. Inscripción a eventos

- **Inmediata y limitada por aforo** — sin aprobación del organizador.
- **Abierta a cualquier usuario autenticado**, sea miembro o no (la membresía
  nunca condiciona la participación). La comprobación del censo (§4) solo aplica a
  los miembros del pueblo del evento.
- Cada inscripción es para **una Persona** que posee el usuario que inscribe.
- **Unicidad:** como máximo **una inscripción por (evento, Persona)** — sin
  inscripciones duplicadas.
- **Aforo:** `maxAttendees` cuenta **solo las inscripciones confirmadas**.
  - `confirmedCount < maxAttendees` → `confirmed`; en caso contrario →
    `waitlisted`.
  - `maxAttendees == null` → **ilimitado**; nunca pone en lista de espera.
- **Lista de espera:** ordenada FIFO por `position`. Cuando se cancela una
  inscripción confirmada, se **promueve automáticamente al de menor `position` en
  espera** (se le notifica con `waitlist_promoted`) y se recalculan los
  contadores.
- `telephoneRequired` (por evento): si es `true`, quien se inscribe debe tener un
  teléfono guardado antes de inscribirse.

### 8.1 Privacidad de asistentes

| Quién lo ve | Qué ve |
|---|---|
| Visitante anónimo | **Solo el recuento** de asistentes |
| Usuario autenticado **no miembro** del pueblo del evento | **Solo el recuento** de asistentes |
| **Miembro** del pueblo del evento | **Nombres** completos de asistentes |
| Los **organizadores** del evento (+ superadministrador) | **Nombres** completos de asistentes |

Las inscripciones desnormalizan el `name` del asistente y una marca `isMember`
(miembro del pueblo del evento vs. visitante) para que las listas no necesiten una
consulta de membresía por asistente.

---

## 9. Noticias

- Viven en **colecciones de nivel superior** con ámbito por `municipalityId`:
  `news/`, `newsComments/`, `newsReactions/`, `newsReports/`.
- **Autoría:** **cualquier usuario autenticado** puede publicar en las noticias de
  cualquier pueblo. Las publicaciones se crean **`active`** y son visibles de
  inmediato — modelo optimista, no hay cola de aprobación. Un **administrador del
  pueblo** (+ superadministrador) puede **ocultar** una publicación a posteriori
  vía el callable `setContentVisibility` (y revertirlo con el mismo callable).
  `status`/`hiddenBy`/`hiddenAt`/`hiddenReason` son **function-owned** — los
  clientes no pueden escribirlos.
- **Lectura:** las publicaciones **`active`** son **públicas** (incluido el
  anónimo). Las publicaciones ocultas solo son visibles para su autor, los
  administradores del pueblo y los superadministradores.
- Los **autores** pueden **editar** y **eliminar sus propias** publicaciones. Los
  administradores pueden **eliminar cualquier** publicación (en cascada) u
  **ocultarla** sin eliminarla.
- **Comentarios y reacciones:** **cualquier usuario autenticado** puede comentar y
  reaccionar. Los comentarios **se publican automáticamente** (sin cola). Una
  reacción por (usuario, publicación) (id determinista `${postId}_${userId}`).
- **Reportes:** **solo comentarios** en v1. Resolver un reporte **oculta** el
  comentario (no lo elimina).
- Las escrituras privilegiadas son callables (`setContentVisibility`,
  `deleteNewsPost`, `resolveNewsReport`); los contadores están desnormalizados y
  **no acotados** (pueden desviarse ante un fallo parcial — no asumir exactitud).

Ver [docs/decisions/news-feed.md](decisions/news-feed.md).

---

## 10. Datos de referencia

- Los **municipios** los **gestiona el superadministrador**. Los **oficios**
  (*occupations*) se eligen de un **catálogo predefinido** (`OCCUPATION_CATALOG`)
  o se **escriben libremente** — sin aprobación: `recordOccupation` registra el
  texto libre en `occupations/{slug}` (id determinista por texto normalizado,
  contador de uso) para alimentar el autocompletado. No hay cola de propuestas.
- Los **barrios** y **lugares** (cementerios, iglesias, …) los puede **crear
  cualquier miembro del pueblo** y aparecen de inmediato (modelo optimista, `status:
  'active'`); el **administrador del pueblo** (+ superadministrador) los edita y, si
  procede, los **oculta** a posteriori vía `setContentVisibility` — presentado como
  "Eliminar" en la pantalla de edición de la entidad. `status`/`hiddenBy`/`hiddenAt`/
  `hiddenReason` son **function-owned**.

### 10.1 Notificaciones

Solo dentro de la app (`users/{uid}/notifications`); **el push está diferido**.
Tipos: `join_request_created` / `_approved` / `_rejected`,
`organizer_request_created` / `_approved` / `_rejected`, `event_cancelled`,
`event_updated`, `waitlist_promoted`.

### 10.2 Eliminación de cuenta

Un usuario puede eliminar su cuenta. El tratamiento es **híbrido**:

- **En cascada / eliminado:** sus Personas (y las inscripciones de esas Personas),
  sus membresías de pueblo (cancelando inscripciones futuras), los eventos que
  organiza **en solitario** (se cancelan), y se le **quita del conjunto de
  organizadores** de los eventos co-organizados.
- **Conservado:** sus **publicaciones y comentarios de noticias** se conservan
  (autor anonimizado, p. ej. «Usuario eliminado») por continuidad del registro de
  la comunidad.
- Las **reacciones** del usuario eliminado se **eliminan** (decrementando los
  contadores de la publicación) — no tienen contenido que merezca conservarse.

---

## 11. Preguntas abiertas

| # | Pregunta | Cómo funciona **hoy** (para el debate) |
|---|---|---|
| OQ-1 | ¿Debe un **miembro de organización ser también miembro del pueblo de esa organización**? | No se exige en ningún sentido. Inclinación: al añadir a alguien a una organización se **crea automáticamente** la membresía del pueblo si no la tiene. **Pendiente de debate con los cofundadores.** |
| ~~OQ-2~~ | ~~Oficios (*occupations*) — lista predefinida y política de aprobación.~~ | **Resuelto:** los oficios se eligen de un catálogo hardcodeado (`OCCUPATION_CATALOG`) o se escriben libremente en la ficha de la Persona; sin cola de propuestas ni aprobación. `recordOccupation` hace upsert en `occupations/{slug}` para alimentar sugerencias. |
| OQ-3 | **Categorías de noticias — ¿qué categorías deberían existir?** | Enum fijo hoy: `fiesta`, `tradicion`, `gastronomia`, `historia`, `otro` (`NEWS_POST_CATEGORIES` en `NewsPostDataModel.ts`, replicado en `firestore.rules`). Cada publicación debe elegir exactamente una. **Abierto:** ¿es el conjunto correcto (añadir/renombrar/eliminar)? |
| OQ-4 | **Tipos de organización — ¿qué tipos pueden existir en un pueblo?** | Enum fijo hoy: `ayuntamiento` (único), `peña`, `asociación` (`OrganizationTypeSchema`). **Abierto:** ¿son los tipos correctos (p. ej. añadir `cofradía`, `club deportivo`, `comisión de fiestas`…)? Añadir un tipo afecta al enum, al validador de reglas y a cualquier cardinalidad específica del tipo. |

---

## 12. Diferido (en otras ramas)

- **Tokens de invitación** — generación, uso único/múltiple, caducidad, máximo de
  usos, revocación. En diseño en una rama paralela.
- **Desactivación / archivado de comunidad** — si una comunidad activa puede
  desactivarse y cómo. En diseño en una rama paralela. *(La activación en sí está
  decidida: una comunidad se activa cuando se aprueba una solicitud de organizador
  y existe un organizador del pueblo.)*

---

## 13. Discrepancias conocidas a reconciliar

Estas reglas son **autoritativas**. Esta tabla registra dónde el código coincide,
diverge o tiene una carencia conocida (reglas vs. código).

| Regla | Estado | Notas |
|---|---|---|
| **Sin precio/pago** (§7.1) | ✅ Conciliado | `price` eliminado de `EventData`, el esquema del formulario, `firestore.rules`, los fixtures de seed y los tests. Se conserva la utilidad genérica de formato `formatPrice` (es agnóstica al evento y está documentada en AGENTS.md). |
| **Pueblo = municipio + comunidad** (§1) | ✅ Conciliado (docs) | El modelo de datos ya es canónico de municipio (`municipalityId` / `municipalityName` / `municipalityCoverImage` / `municipalityCoordinates`, `activeMunicipalityId`). Se corrigieron los nombres de campo obsoletos en los docs de decisión. Las referencias `villages/` restantes son **rutas de Cloud Storage** y **nombres de carpeta de parámetros de ruta en móvil**, donde «village/pueblo» es el término coloquial pretendido — se dejan tal cual (renombrar las rutas de Storage huérfanaría imágenes ya subidas). |
| **Organizadores como conjunto** de usuarios + organizaciones (§7.2) | ⏳ Planificado | El código aún almacena un único `organizationId` / `organizationName` / `createdBy`. Es un cambio grande y sensible a la seguridad — las reglas de Firestore no pueden expresar «un miembro de *cualquier* organización co-organizadora puede editar» mediante iteración de arrays, así que requiere un enfoque mediante callable o desnormalizado. Plan: [event-co-organizers](plans/ready/event-co-organizers.md). |
| **Unicidad de ayuntamiento** (§6) | ✅ Conciliado | Aplicado por el callable `requestAyuntamiento` (una transacción rechaza un segundo ayuntamiento pendiente/aprobado). `firestore.rules` deniega las creaciones de `type == 'ayuntamiento'` desde el cliente; `peña` / `asociación` siguen creándose desde el cliente. |
