---
verifier: agent
accounts: admin
platform: any
data: seed
source: feat/template-item-sheet
---
# Una plantilla de tareas se escribe tarea a tarea, en una hoja aparte

**Preparación:** Como admin de un grupo con socios (p. ej. Museros en dev), abre Tareas → Plantillas.

**Pasos:**
1. Pulsa «Nueva plantilla»: ves el nombre, «Tareas» con «Aún no hay tareas. Añade la primera.» y el botón «Añadir tarea».
2. Pulsa «Añadir tarea»: se abre una hoja «Nueva tarea» con el teclado en «¿Qué hay que hacer?». Escribe «Pedir la orquesta», elige «Antes», escribe 60 en «¿Cuántos días antes?» y pulsa «Añadir a la plantilla».
3. Añade otra con «El mismo día» y 4 plazas.
4. Toca la primera fila, cámbiala a 30 días y guarda; luego toca la segunda y pulsa «Quitar tarea».
5. Pon nombre y «Guardar plantilla». Vuelve a abrirla.

**Esperado:** Cada fila dice su título y «60 días antes» / «El mismo día · 4 plazas»; tras el paso 4 solo queda «Pedir la orquesta — 30 días antes». Con «El mismo día» no aparece el campo de días. Al reabrir la plantilla está igual. Guardar desde «Guardar como plantilla» en las tareas de un evento muestra sus tareas como filas.

**Roto se ve así:** «Añadir tarea» añade una tarjeta con tres campos a la lista en vez de abrir la hoja; el campo de días pide números negativos; o la hoja no se abre encima del formulario de la plantilla (sobre todo en iOS).
