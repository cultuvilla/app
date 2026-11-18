---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Explora sin resultados lo dice y deja limpiar los filtros

**Preparación:** Sesión como user.

**Pasos:**
1. Explora → busca «zzzz» y/o pon un filtro de fechas sin eventos.
2. Limpia los filtros.

**Esperado:** Un estado vacío con texto, no una lista en blanco; al limpiar vuelven los eventos.

**Roto se ve así:** Lista en blanco sin mensaje, o filtros que no se pueden quitar.
