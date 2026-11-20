---
verifier: agent
accounts: fresh+user
platform: android
data: seed
source: fix/stats-consent-page
---

# Las estadísticas de uso se piden en una página aparte, después de la primera acción o al tercer día

**Preparación:** Seed de e2e. En el emulador borra `users/e2e-fresh/privacySettings/account` y `users/e2e-attendee/privacySettings/account` (el seed contesta «no» por todos). Antes de cada parte, borra los datos de la app (Ajustes de Android → Apps → Cultuvilla → Borrar datos) para empezar sin días contados.

**Pasos:**

1. Entra con `fresh` y completa «Completa tu perfil».
2. Con `e2e-attendee`: abre un evento con inscripción y apúntate. Quédate en el evento unos segundos; luego vuelve atrás.
3. Pulsa el botón atrás de Android con la página abierta. Navega por la app.
4. Adelanta la fecha del dispositivo un día y vuelve a abrir la app (traerla al frente basta). Navega a otra pantalla. Pulsa atrás otra vez.
5. Adelanta otro día y vuelve a abrir la app; navega un rato.
6. Borra los datos de la app y entra con `e2e-attendee` sin hacer nada; cierra. Repite con la fecha un día y dos días adelantada.
7. En la página del paso 6 pulsa «Sí, claro». Cierra la app y vuelve otro día.
8. Menú → Ajustes → «Estadísticas de uso»: apágalo y enciéndelo.

**Esperado:** Paso 1: el primer paso solo pide la casilla de términos, sin pregunta de estadísticas; al terminar no sale ninguna página. Paso 2: nada sale mientras sigues en el evento (ni encima de la hoja de inscripción); al volver aparece a pantalla completa, deslizándose desde abajo: el dibujo del pueblo cuyas casas y torre son barras que suben, «¿Nos ayudas a mejorar Cultuvilla?», el texto y la letra pequeña, y abajo «No, gracias» (con borde) y «Sí, claro» (relleno), del mismo tamaño y uno al lado del otro; no hay botón de cerrar. Paso 3: se cierra, no se crea `privacySettings/account`, y ya no vuelve ese día. Paso 4: vuelve a salir; tras el segundo atrás, nada guardado. Paso 5: no vuelve a salir nunca más. Paso 6: no sale el primer ni el segundo día; el tercer día sale al abrir. Paso 7: se cierra con un toque, el documento dice `usageAnalytics: true` y no vuelve. Paso 8: el interruptor refleja y guarda lo elegido.

**Roto se ve así:** la pregunta sigue en el registro; la página sale durante el registro, encima de un formulario o de la hoja de inscripción, o a quien ya contestó; sale antes del tercer día sin haber hecho nada; atrás guarda una respuesta; sale una tercera vez tras dos cierres; un botón es más pequeño o menos visible que el otro; o un invitado la ve.
