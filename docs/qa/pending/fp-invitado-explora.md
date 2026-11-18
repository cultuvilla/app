---
verifier: agent
accounts: none
platform: android
data: seed
source: full-pass-2026-11-18
---
# El invitado puede curiosear sin cuenta y cada acción le pide entrar

**Preparación:** Sin sesión (instalación limpia).

**Pasos:**
1. Abre la app: Explora muestra eventos sembrados (p. ej. «Fiesta de Prueba E2E»).
2. Abre un evento, luego el pueblo «Altozano de Prueba» desde el evento.
3. Pulsa Apuntarme / Comentar / Unirme a un pueblo.

**Esperado:** Todo se lee sin cuenta; cada acción lleva a la pantalla de entrar, y al volver atrás sigues donde estabas.

**Roto se ve así:** Pantalla en blanco o spinner eterno sin sesión, una acción que falla en silencio, o volver atrás que te saca de la app.
