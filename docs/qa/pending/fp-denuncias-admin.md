---
verifier: agent
accounts: user+superadmin
platform: android
data: seed
source: full-pass-2026-11-18
---
# Una denuncia llega al panel de admin y se puede resolver

**Preparación:** User denuncia un comentario (flujo 41 lo hace; repítelo).

**Pasos:**
1. Superadmin: Admin → denuncias; resuelve la denuncia.
2. Admin del pueblo: pueblo → denuncias.

**Esperado:** La denuncia aparece con el contenido denunciado; al resolverla cambia de estado en Firestore y deja la lista pendiente.

**Roto se ve así:** La denuncia no llega, o resolverla no cambia nada.
