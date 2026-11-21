---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: develop (cosateca-te-toca)
---
# La Cosateca separa «Te toca» de «En curso»

**Preparación:** En un grupo de la semilla con la Cosateca activada, entra como `e2e-user` y ofrece un préstamo («Escalera»). Entra luego como el admin y pide la escalera, con fechas.

**Pasos:**
1. Como el admin, abre la Cosateca del grupo.
2. Entra como `e2e-user`. En el inicio del grupo, mira el botón Cosateca.
3. Abre la Cosateca.
4. Toca «Aceptar» en la tarjeta de la petición.
5. Toca «Ya lo he entregado» en la misma tarjeta.
6. Vuelve como el admin y abre la Cosateca.

**Esperado:** En el paso 1 no hay «Te toca»: hay una línea verde «Nada pendiente por tu parte» y, debajo, «En curso» con «Pediste «Escalera»» · «Esperando respuesta». En el paso 2 el botón Cosateca lleva un 1. En el paso 3, bajo «Te toca 1», hay una tarjeta con borde de color: «… te pide «Escalera»», sus fechas, y los botones Aceptar y Rechazar. Tras el paso 4 la misma tarjeta dice «Entrega «Escalera» a …» con el botón «Ya lo he entregado». Tras el paso 5 desaparece de «Te toca», sale la línea verde y la escalera pasa a «En curso» («… tiene «Escalera»», «Hasta el …»). En el paso 6 el admin la ve en «En curso» como «Tienes «Escalera»» · «Vuelve el …».

**Roto se ve así:** Las peticiones salen en una tira lateral igual que lo demás; los botones no hacen nada o abren la solicitud; la línea verde aparece mientras hay algo en «Te toca»; o el botón Cosateca no lleva número.
