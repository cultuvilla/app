---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# Los enlaces del pueblo abren la pantalla correcta, y uno roto avisa

**Preparación:** Sesión como user. Busca el id de un evento, una noticia y un lugar con `fs.mjs`.

**Pasos:**
1. `qa.sh link altozano-de-prueba/evento/x_<id>`; igual para noticia y lugar.
2. `qa.sh link altozano-de-prueba/evento/x_noexiste`.

**Esperado:** Cada enlace abre su detalle; el roto muestra «no encontrado» con salida, no un crash.

**Roto se ve así:** Un enlace que cae en la portada, o pantalla roja/blanca con el id inexistente.
