---
verifier: agent
accounts: admin+user
platform: android
data: mirror:Matabuena
source: full-pass-2026-11-18
---
# Censo, miembros y resumen del pueblo se ven bien según quién mira

**Preparación:** el seed e2e no enlaza a los miembros con el pueblo (`municipalityLinks: []`), así que Personas solo lista personas a cargo: copia un pueblo real con `pnpm mirror:village --municipality=Matabuena` y haz admin y user miembros de él desde la app. Sesión como admin, luego user.

**Pasos:**
1. Como admin: Mi pueblo → miembros, censo, resumen.
2. Igual como user.

**Esperado:** El admin ve sus controles (insignias de equipo/Embajador, acciones); el user ve lo mismo sin controles de gestión. Los recuentos coinciden con `municipalities/<id>/members`.

**Roto se ve así:** El vecino ve controles de admin, o un recuento distinto del real.
