---
verifier: agent
accounts: fresh
platform: any
data: seed
source: feat/orphaned-session-guard
---
# Una cuenta borrada en otro sitio cierra la sesión al abrir la app

**Preparación:** Una cuenta de prueba desechable (no la tuya) con la sesión iniciada en el móvil. Cierra la app del todo (quitarla de recientes).

**Pasos:**
1. Con la app cerrada, borra esa cuenta desde fuera del móvil (en el emulador de Auth, o desde la consola de Firebase en dev).
2. Abre la app.
3. Repite con otra cuenta desechable, esta vez desactivándola en lugar de borrarla.
4. Repite con una cuenta que sigue existiendo, abriendo la app sin conexión.

**Esperado:** En los pasos 2 y 3 la app se reinicia sola sin sesión y muestra una vez «Tu cuenta ya no está disponible — Hemos cerrado la sesión en este dispositivo.» con el botón «Entendido»; al volver a abrirla no sale más. En el paso 4 la sesión sigue abierta y no sale ningún aviso.

**Roto se ve así:** La app abre como si siguieras dentro pero no carga nada (pantallas vacías o errores de permisos); se cierra la sesión sin ningún aviso; el aviso sale en cada arranque; o abrir sin conexión cierra la sesión.
