---
verifier: agent
accounts: admin+user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Censo, miembros y resumen del pueblo se ven bien según quién mira

**Preparación:** seed e2e: en Altozano de Prueba son miembros e2e-admin (admin), e2e-user y e2e-joiner, y Personas los lista junto a las personas enlazadas al pueblo. Sesión como admin, luego user.

**Pasos:**
1. Como admin: Mi pueblo → miembros, censo, resumen.
2. Igual como user.

**Esperado:** El admin ve sus controles (insignias de equipo/Embajador, acciones); el user ve lo mismo sin controles de gestión. Los recuentos coinciden con `municipalities/<id>/members`.

**Roto se ve así:** El vecino ve controles de admin, o un recuento distinto del real.
