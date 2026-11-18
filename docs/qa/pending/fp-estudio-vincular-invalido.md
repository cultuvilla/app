---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Un enlace de vinculación del estudio caducado o falso avisa sin romperse

**Preparación:** Sesión como user.

**Pasos:**
1. `qa.sh link estudio/vincular/noexiste`.

**Esperado:** Mensaje claro de enlace no válido y salida a la app.

**Roto se ve así:** Crash, spinner eterno o pantalla en blanco.
