---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Compartir un evento ofrece un enlace con la URL del pueblo

**Preparación:** Sesión como user. Cualquier evento sembrado.

**Pasos:**
1. Detalle del evento → compartir.

**Esperado:** Se abre la hoja de compartir de Android con un enlace `…/altozano-de-prueba/evento/<titulo>_<id>`.

**Roto se ve así:** No se abre nada, o el enlace es un id suelto o de otro pueblo.
