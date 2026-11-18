---
verifier: agent
accounts: fresh
platform: android
data: seed
source: full-pass-2026-11-18
---
# Quien deja el perfil a medias vuelve a él al reabrir la app

**Preparación:** Cuenta `fresh` (sin persona).

**Pasos:**
1. Entra como fresh: aparece completar perfil.
2. Rellena el primer paso, cierra la app (`am force-stop`) y ábrela de nuevo.

**Esperado:** Vuelves a completar perfil, no a las pestañas; no se ha creado `persons/` a medias (`fs.mjs query persons userId EQUAL '"e2e-fresh"'`).

**Roto se ve así:** Entra a las pestañas sin perfil, o crea una persona incompleta que rompe otras pantallas.
