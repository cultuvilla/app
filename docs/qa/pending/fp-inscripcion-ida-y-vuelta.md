---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Apuntarse, borrarse y volver a apuntarse deja una sola inscripción

**Preparación:** Sesión como user. Evento «Evento con Aforo E2E».

**Pasos:**
1. Apúntate.
2. Bórrate.
3. Apúntate otra vez.
4. Abre Mis inscripciones.

**Esperado:** Una sola inscripción activa en `events/<id>/registrations`; `confirmedCount` del evento = 1 más lo que hubiera; Mis inscripciones la lista una vez.

**Roto se ve así:** Dos inscripciones, un contador desfasado, o Mis inscripciones vacía o duplicada.
