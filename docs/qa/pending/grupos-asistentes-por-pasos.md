---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# Grupos: tarea, acta, cosa e ingreso/gasto paso a paso, con encargados y voluntarios a la vez

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`), con Actas, Cuentas y la Cosateca activadas.

**Pasos:**
1. Tareas → «Nueva tarea». Escribe un nombre, pulsa Siguiente, elige «En fecha fija» sin fecha, luego pon una fecha, Siguiente. En «Quién se encarga» marca a una persona, activa «Se buscan voluntarios» y escribe 3. Guarda y abre la tarea; entra como esa persona y como otra integrante.
2. Abre la tarea, pulsa Editar, toca el último punto de la barra de pasos y guarda. Vuelve a la tarea y pulsa «Eliminar tarea».
3. Registros → Actas. Baja hasta el final de la lista y pulsa el botón naranja «Nueva acta». Recorre Reunión → Socios presentes → Acuerdos y guarda.
4. Registros → Cuentas → «Añadir movimiento». Elige Ingreso, escribe 25, Siguiente, escribe un concepto y anota.
5. Cosateca → «Ofrecer». Elige una foto alargada (vertical o apaisada), escribe un nombre, Siguiente, elige «La presto» y publica. Abre la cosa y pulsa la papelera de arriba.
6. Registros → Actas → «Nueva acta» → Siguiente: mira la lista de socios presentes.

**Esperado:** Las cuatro pantallas tienen arriba la misma barra de pasos que «Crear evento» y abajo Atrás / Siguiente. En el paso 1, sin fecha, sale «Para repetir en fecha fija, pon una fecha.» y Siguiente no avanza; con fecha avanza. «Quién se encarga» lista a todo el grupo con su foto (o su inicial) para marcar, y sigue ahí al activar «Se buscan voluntarios». La tarea dice «Para …» y «0 de 3 plazas» a la vez; en Personas la encargada lleva «Se encarga». Ella ve «Te encargas tú» y «Quitarme», sin «Me apunto»; la otra integrante ve «Me apunto». En el paso 2, Editar deja tocar cualquier punto y la tarea eliminada dice que ya no está. En el paso 3 el botón naranja se queda fijo abajo mientras la lista se mueve, y la última acta se ve entera por encima de él. En el paso 4 el movimiento sale en la lista con +25,00 €. En el paso 5 la foto está en el mismo paso que el nombre y se ve entera, con su forma, como la imagen de un evento; tras la papelera vuelves a la Cosateca sin la cosa. En el paso 6 cada socio lleva su foto si tiene la app, o su inicial.

**Roto se ve así:** Un formulario largo de una sola página con un solo botón Guardar, el botón «Nueva acta» pequeño arriba de la lista, Guardar que funciona con un paso anterior mal rellenado, «Eliminar» todavía dentro del formulario de edición, los encargados desaparecen al activar «Se buscan voluntarios», o la foto de la cosa recortada en un paso propio.
