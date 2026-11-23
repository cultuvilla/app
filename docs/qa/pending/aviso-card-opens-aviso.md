---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: feat/aviso-card-opens-aviso
---
# La tarjeta de un aviso en el inicio del grupo abre los avisos, con su encuesta

**Preparación:** Como admin de la asociación de la semilla (`e2e-org-asociacion`), envía desde Mensajes un aviso **con encuesta** a todos los socios. Entra luego como el socio (`e2e-user`).

**Pasos:**
1. En la pestaña Grupos, en el inicio de la asociación, mira la fila Avisos: la tarjeta del aviso nuevo lleva el punto de no leído.
2. Toca la tarjeta.
3. Vota una opción de la encuesta.
4. Toca «Ver la conversación» debajo del aviso.
5. Vuelve atrás dos veces, al inicio del grupo.

**Esperado:** El paso 2 abre la pantalla Avisos (la misma que «Ver todo»), con el aviso, su encuesta y los botones para votar; el voto del paso 3 queda marcado («Has respondido: …»). El paso 4 abre el chat del aviso, con el aviso arriba. En el paso 5 la tarjeta ya no lleva el punto.

**Roto se ve así:** La tarjeta abre directamente el chat del aviso, sin encuesta; o en Avisos no hay forma de llegar al chat; o el punto sigue en la tarjeta después de abrirlo.
