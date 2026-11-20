---
verifier: agent
accounts: fresh+user
platform: android
data: seed
source: fix/stats-consent-page
---

# Las estadísticas de uso se piden a pantalla completa nada más abrir la app

**Preparación:** Seed de e2e. En el emulador borra `users/e2e-fresh/privacySettings/account` y `users/e2e-attendee/privacySettings/account` (el seed contesta «no» por todos).

**Pasos:**

1. Entra con `fresh` y completa «Completa tu perfil».
2. Con la página abierta, pulsa el botón atrás de Android.
3. Pulsa «No, gracias». Cierra la app del todo y vuelve a abrirla.
4. Entra con `e2e-attendee` y abre la app.
5. Pulsa «Sí, claro». Cierra la app y vuelve a abrirla.
6. Menú → Ajustes → «Estadísticas de uso»: apágalo y enciéndelo.

**Esperado:** Paso 1: el primer paso solo pide la casilla de términos, sin pregunta de estadísticas; al terminar, la página sale enseguida a pantalla completa, deslizándose desde abajo: el dibujo del pueblo cuyas casas y torre son barras que suben, «¿Nos ayudas a mejorar Cultuvilla?», el texto y la letra pequeña, y abajo «No, gracias» (con borde) y «Sí, claro» (relleno), del mismo tamaño y uno al lado del otro; no hay botón de cerrar. Paso 2: no pasa nada, la página sigue ahí. Paso 3: se cierra, el documento dice `usageAnalytics: false` y al reabrir no vuelve. Paso 4: sale al abrir, antes de hacer nada. Paso 5: el documento dice `usageAnalytics: true` y no vuelve. Paso 6: el interruptor refleja y guarda lo elegido.

**Roto se ve así:** la pregunta sigue en el registro; sale una hoja pequeña desde abajo en vez de la página completa; sale durante el registro o a quien ya contestó; atrás la cierra; un botón es más pequeño o menos visible que el otro; o un invitado la ve.
