---
verifier: agent
accounts: user+admin+fresh
platform: android
data: seed
source: fix/qa-visual-polish
---
# Pequeños fallos visuales de la pasada del 2026-11-21, corregidos

**Preparación:** emuladores con el seed e2e. `user` es vecino de Altozano de Prueba y socio de un grupo con personas a cargo; `admin` administra un grupo con socios; una cuenta que aún no ha contestado la pregunta de estadísticas (`fresh` al terminar el perfil, o borrando `users/<uid>/private/privacy`).

**Pasos:**
1. Como `user`, abre Altozano de Prueba por enlace (`cultuvilla://altozano-de-prueba`) y haz capturas seguidas mientras carga la fila de acciones.
2. Como cuenta sin respuesta a estadísticas, abre la app y espera la página «¿Nos ayudas a mejorar Cultuvilla?».
3. Como `user`, en su grupo → Socios → «Hacer socio a…» (`persona-socio-sheet`).
4. Como `user`, apúntate a un evento con `e2e-event-…` abierto hasta que salga la hoja «¿Te avisamos si cambia algo?» (`push-soft-ask-sheet`).
5. Como `admin`, abre Nuevo aviso, Nueva tarea y «Añadir socio sin la app»; escribe en un campo, cierra el teclado con atrás y mira el pie de la pantalla.

**Esperado:**
1. Nunca aparece «Unirme a este pueblo» (ni «Unirme a este pue…»): el hueco de la izquierda queda vacío un instante y sale directamente «Añadir contenido». Un invitado sí ve «Inicia sesión para unirte» enseguida.
2. Los iconos de la barra de estado (hora, batería) son oscuros sobre el fondo crema.
3. Los nombres de las personas a cargo tienen el mismo margen izquierdo que el título y que «Añadir persona a cargo».
4. «Sí, avisadme» y «Ahora no» tienen margen a los lados, como los botones de las demás hojas.
5. Con el teclado abierto el botón queda justo encima del teclado; al cerrarlo, el pie blanco vuelve a llegar hasta el borde inferior de la pantalla, sin franja crema debajo.

**Pasada del autor 2026-11-21 (Android, APK e2e):** ✅ 1 (no aparece «Unirme»; un instante hueco vacío), 2 (iconos oscuros, y vuelven a blancos al contestar), 3, 5 (Nueva tarea y Añadir socio sin la app). Sin probar: 4 en dispositivo (necesita el permiso de notificaciones sin decidir) y Nuevo aviso.

**Roto se ve así:** «Unirme a este pue…» un instante antes de «Añadir contenido»; iconos blancos casi invisibles sobre crema; texto pegado al borde izquierdo; un botón terracota de borde a borde; una franja crema de ~60 dp bajo el pie blanco.
