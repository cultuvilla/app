---
verifier: agent
accounts: admin
platform: android
data: seed
source: full-pass-2026-11-18
---
# La pestaña Grupos lleva a cada sección de cada grupo

**Preparación:** Sesión como admin (pertenece a varios grupos sembrados).

**Pasos:**
1. Pestaña Grupos: abre cada grupo y cada sección (avisos, charla, cuota, tareas, cosateca, registros/actas, eventos).

**Esperado:** Cada sección carga o explica que está vacía/desactivada; atrás vuelve al grupo.

**Roto se ve así:** Una sección que no carga, o una sección desactivada que se abre en blanco.
