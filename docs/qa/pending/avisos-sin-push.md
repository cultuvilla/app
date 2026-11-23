---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: feat/avisos-no-push
---
# Los avisos no suenan en el móvil, y un socio puede enviarlos si la junta lo permite

**Preparación:** La asociación de la semilla (`e2e-org-asociacion`), con su admin y el socio `e2e-user`. El socio tiene las notificaciones permitidas en el móvil.

**Pasos:**
1. Como admin, en Gestionar → Mensajes, envía un aviso a todos los socios con «Aviso en la app» activado. Abre el aviso enviado.
2. Como socio, con la app en segundo plano mientras se envía, mira si el móvil notifica. Abre luego el Buzón y el inicio del grupo.
3. Como socio, abre Ajustes → Notificaciones y mira la sección «Tus grupos» y la fila del grupo en «Por grupo».
4. Como socio, abre Avisos del grupo.
5. Como admin, en Gestionar → Ajustes, sección «Qué pueden hacer los socios», activa «Enviar avisos».
6. Como socio, vuelve a Avisos, toca «Enviar un aviso», escribe asunto y mensaje y envía.
7. Como admin, mira el Buzón, Avisos y Gestionar → Mensajes.
8. Como socio, escribe un mensaje en la Charla del grupo, con el admin habiendo elegido «De todo» para ese grupo.

**Esperado:** En el paso 1 el detalle del aviso enseña quién lo ha leído y quién no, sin botón para recordárselo; tampoco lo hay en la fila de la lista. En el paso 2 el móvil no notifica nada, pero el aviso está en el Buzón como no leído y la tarjeta de Avisos lleva su punto. En el paso 3 no existe el interruptor «Avisos de la junta» y el grupo ofrece dos niveles, «De todo» y «Solo lo que me toca». En el paso 4 no hay botón para enviar. En el paso 5 el interruptor aparece apagado y se queda encendido. En el paso 6 el formulario solo tiene asunto y mensaje (sin destinatarios, canales ni encuesta) y confirma a cuántas personas ha llegado. En el paso 7 el admin tiene el aviso del socio en el Buzón sin leer, sin notificación en el móvil, firmado con el nombre del socio, y lo ve en su lista de Mensajes. En el paso 8 el admin sí recibe la notificación en el móvil.

**Roto se ve así:** El móvil vibra o enseña una notificación al llegar un aviso; el aviso no aparece en el Buzón o no lleva el punto; sigue el botón «Recordárselo a quien no lo ha leído»; el socio puede enviar con el ajuste apagado, o su formulario ofrece encuesta, email o WhatsApp; la Charla deja de notificar.
