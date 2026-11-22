---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# Grupos: tarea, acta, cosa e ingreso/gasto paso a paso

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`), con Actas, Cuentas y la Cosateca activadas.

**Pasos:**
1. Tareas → «Nueva tarea». Escribe un nombre, pulsa Siguiente, elige «En fecha fija» sin fecha, luego pon una fecha, Siguiente, marca «Es un turno de voluntarios» y escribe 3. Guarda.
2. Abre la tarea, pulsa Editar, toca el último punto de la barra de pasos y guarda. Vuelve a la tarea y pulsa «Eliminar tarea».
3. Registros → Actas. Baja hasta el final de la lista y pulsa el botón naranja «Nueva acta». Recorre Reunión → Socios presentes → Acuerdos y guarda.
4. Registros → Cuentas → «Añadir movimiento». Elige Ingreso, escribe 25, Siguiente, escribe un concepto y anota.
5. Cosateca → «Ofrecer». En el paso de la foto pulsa «Sin foto», escribe un nombre, Siguiente, elige «La presto» y publica. Abre la cosa y pulsa la papelera de arriba.

**Esperado:** Las cuatro pantallas tienen arriba la misma barra de pasos que «Crear evento» y abajo Atrás / Siguiente. En el paso 1, sin fecha, sale «Para repetir en fecha fija, pon una fecha.» y Siguiente no avanza; con fecha avanza. En el paso 2, Editar deja tocar cualquier punto y la tarea eliminada dice que ya no está. En el paso 3 el botón naranja se queda fijo abajo mientras la lista se mueve, y la última acta se ve entera por encima de él. En el paso 4 el movimiento sale en la lista con +25,00 €. En el paso 5 el botón dice «Sin foto» hasta que eliges una (con una foto pasa solo al siguiente paso), y tras la papelera vuelves a la Cosateca sin la cosa.

**Roto se ve así:** Un formulario largo de una sola página con un solo botón Guardar, el botón «Nueva acta» pequeño arriba de la lista, Guardar que funciona con un paso anterior mal rellenado, o «Eliminar» todavía dentro del formulario de edición.
