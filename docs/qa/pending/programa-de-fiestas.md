---
verifier: agent
accounts: admin, member, guest
platform: any
data: seed
source: feat/programa-de-fiestas-app
---
# El programa de fiestas: fechas, eventos del programa y el enlace de fiestas

**Preparación:** Un pueblo con al menos un bloque de fiestas en «Fiestas del pueblo» (Editar pueblo → Comunidad), p. ej. «Santiago» en el mes que viene. Una cuenta integrante (no admin), una admin del pueblo, y la app sin sesión (invitado). Sin resumen (Wrapped) publicado para este año.

**Pasos:**
1. Como integrante, abre el pueblo. En la tarjeta «¿Cuándo son las fiestas de Santiago …?», pulsa «Añadir las fechas», elige tres días y guarda.
2. Vuelve al pueblo.
3. Como integrante, crea un evento con fecha dentro de esos días. En «Cuándo», mira el interruptor «Forma parte de las fiestas de Santiago …» y publícalo tal cual. Crea otro en esas fechas con el interruptor apagado, y un tercero fuera de esas fechas.
4. Abre `/<pueblo>/fiestas/<año>` desde la tarjeta del pueblo («Ver el programa»).
5. Como otra integrante (que no propuso las fechas), abre la misma página. Luego como admin, pulsa «Cambiar las fechas», mueve un día y guarda.
6. Como invitado, abre el mismo enlace en la app y en el navegador (cultuvilla.es/<pueblo>/fiestas/<año>, o el host de dev).
7. Como admin, abre «Resumen de fiestas» del año (después de las fechas, o con fechas pasadas).

**Esperado:** Paso 1: el editor abre en el mes del bloque; un rango de más de un mes o de otro año muestra el error y no deja guardar. Paso 2: la tarjeta pasa a «Fiestas de Santiago …» con «Faltan N días · 24 – 26 jul» y «Ver el programa». Paso 3: el interruptor solo aparece con la fecha dentro de las fiestas, y viene encendido. Paso 4: «Programa de fiestas <año>» con Santiago, sus fechas, y por día («viernes, 24 de julio»…) solo el primer evento, con su hora y lugar; tocarlo abre el evento. «Compartir el programa» comparte el enlace de fiestas. Paso 5: la otra integrante no ve «Cambiar las fechas»; la admin sí, y el cambio se ve al momento. Paso 6: el invitado ve el mismo programa sin botones de edición; la web muestra el programa por días con enlaces a cada evento, y la vista previa usa el cartel del año si lo hay. Paso 7: el bloque viene con los días de las fechas ya puestos.

**Roto se ve así:** la tarjeta del pueblo no aparece en el mes de las fiestas; el interruptor no aparece o viene apagado; el evento con el interruptor apagado o el de otras fechas sale en el programa; la página de fiestas dice «no existe» teniendo fechas; otra integrante puede cambiar las fechas; la web da 404; o el resumen pide elegir los días de nuevo.
