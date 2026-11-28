---
verifier: agent
accounts: fresh
platform: any
data: seed
source: feat/remember-the-update-wall
---
# El bloqueo de actualización se recuerda sin conexión

**Preparación:** App de desarrollo contra los emuladores sembrados. Sube `config/appVersion.<plataforma>.minSupported` por encima de la versión instalada (p. ej. `99.0.0`) y abre la app una vez para que vea el bloqueo.

**Pasos:**
1. Cierra la app del todo. Corta la red del dispositivo (modo avión) o para los emuladores.
2. Abre la app.
3. Vuelve a dar red, baja el muro a `0.0.0` y espera unos segundos.
4. Cierra y abre la app otra vez, todavía sin red.

**Esperado:** En 2 aparece la tarjeta «actualiza» nada más abrir, sin que asome ninguna pantalla de la app, y su botón abre la tienda. En 3 el bloqueo se va solo y vuelve la app. En 4 la app abre con normalidad.

**Roto se ve así:** Sin red la app abre como si nada, o se ve un instante la pantalla del pueblo antes de la tarjeta; o tras bajar el muro la app sigue bloqueada al reabrirla.
