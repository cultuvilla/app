---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: develop
---
# Cosateca: la ficha de una cosa y la solicitud como conversación

**Preparación:** Con la Cosateca de la asociación de la semilla (`e2e-org-asociacion`) activada, el socio (`e2e-user`) ofrece un préstamo con foto, condiciones y una nota de dónde está. Entra como admin (`e2e-admin`).

**Pasos:**
1. Abre la cosa desde la Cosateca.
2. Toca «Pedirlo», escribe un mensaje y envía.
3. En la solicitud, toca la tarjeta de arriba y vuelve.
4. Entra como el socio, abre la solicitud y escribe un mensaje en el chat.
5. Acepta la solicitud y después marca «Ya lo he entregado».
6. Como socio, abre la cosa y toca el icono de pausa de la barra de arriba.

**Esperado:** En el paso 1 la foto ocupa todo el ancho; debajo, el título, «Préstamo · <categoría>» en gris (sin pastillas), «✓ Disponible» en verde y una tarjeta con iconos (quién lo ofrece, dónde, condiciones). «Pedirlo» es un botón naranja fijo abajo, visible sin bajar. El paso 2 abre la solicitud: arriba la cosa con sus fechas y una flecha, el estado y una barra de pasos «Pendiente · Aceptada · Prestada · Devuelta» con el primero marcado; el chat llena el resto y la caja para escribir está abajo, con «Cancelar solicitud» en rojo con borde justo encima. El paso 3 abre la cosa. En el paso 4 los mensajes propios van a la derecha y los del otro a la izquierda, y «Rechazar» (rojo, con borde) y «Aceptar» (naranja) están uno al lado del otro sobre la caja. En el paso 5 la barra de pasos avanza. En el paso 6 la cosa pasa a «En pausa» y el icono cambia a reanudar.

**Roto se ve así:** «Pedirlo» queda al final del scroll; los botones «Rechazar»/«Cancelar» parecen texto; el chat queda debajo de todo y hay que bajar para escribir; las etiquetas Préstamo/categoría siguen pareciendo botones.
