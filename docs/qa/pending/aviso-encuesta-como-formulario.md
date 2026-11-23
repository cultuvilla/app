---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# La encuesta de un aviso se crea como el formulario de un evento

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`). Abre Mensajes y toca «Nuevo aviso». Escribe un asunto y un mensaje.

**Pasos:**
1. Baja hasta debajo de los canales.
2. Toca «Añadir encuesta» y elige «Elegir una opción».
3. Escribe la pregunta, toca «Añadir opción» y rellena tres opciones; quita la tercera con su ✕.
4. Toca el selector «Elegir una opción» de la tarjeta y cambia a «Sí o no».
5. Toca la papelera de la tarjeta.
6. Vuelve a añadir una encuesta «Sí o no», escribe la pregunta y envía.

**Esperado:** En el paso 1 hay un botón con borde de rayas «Añadir encuesta», como «Añadir pregunta» al crear un evento, y ya no hay un selector Sin encuesta / Sí o no / Varias opciones. El paso 2 abre la hoja «¿Cómo se responde?» y luego una tarjeta con el borde izquierdo naranja. En el paso 3 las opciones tienen un círculo delante y un ✕ detrás; con solo dos opciones no hay ✕. En el paso 4 la tarjeta enseña «Sí» y «No». El paso 5 quita la encuesta y vuelve el botón de rayas. En el paso 6 el aviso llega con su encuesta de Sí o No y se puede votar.

**Roto se ve así:** Sigue el selector de tres opciones; la hoja de tipo no se abre encima del formulario; se puede dejar la encuesta con menos de dos opciones.
