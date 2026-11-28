---
verifier: agent
accounts: fresh
platform: any
data: seed
source: fix/hard-wall-tree
---
# El bloqueo de actualización sustituye a la app

**Preparación:** App de desarrollo contra los emuladores sembrados. Sube `config/appVersion.<plataforma>.minSupported` por encima de la versión instalada (p. ej. `99.0.0`).

**Pasos:**
1. Con la app abierta en una pantalla de un pueblo, sube el muro.
2. Pulsa atrás en Android.
3. Con el muro puesto, abre un enlace `…/<pueblo>/evento/<titulo>_<id>` (o `adb shell am start -d`).
4. Baja el muro a `0.0.0`.

**Esperado:** En 1 aparece la misma tarjeta «actualiza» de siempre, sobre una pantalla vacía (ya no se ve la app detrás). Atrás no la cierra. El enlace no abre ninguna pantalla. Al bajar el muro vuelve la app.

**Roto se ve así:** Detrás de la tarjeta se ve la pantalla del pueblo, o el enlace abre el evento bajo el bloqueo.
