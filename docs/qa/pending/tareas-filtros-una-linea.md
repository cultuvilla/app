---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: develop
---
# Tareas: filtros en una línea, plantillas aparte y el podio al final

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`), que tiene un evento con tareas y alguna tarea hecha este año. Abre la pantalla Tareas del grupo.

**Pasos:**
1. Mira la fila de filtros, arriba.
2. Toca el botón de filtros que está al final de esa fila, marca «Turnos con hueco» y cierra la hoja.
3. Vuelve a abrir el botón y toca «Quitar filtros».
4. Abre un evento y mira los botones debajo de sus tareas.
5. Baja hasta el final de la pantalla.
6. En Plantillas, toca «Aplicar» en una plantilla.

**Esperado:** En el paso 1 hay una sola línea: «Mías», «Sin asignar», «Hechas» y, a la derecha, un botón con el icono de filtros. En el paso 2 la lista se filtra, el botón muestra «1» y «Turnos con hueco» aparece en la línea; el paso 3 lo quita. En el paso 4 solo está «Añadir tarea», con forma de botón. En el paso 5 aparece una tarjeta «Plantillas» separada y, cerrando la pantalla, el podio (quién ha hecho más tareas). El paso 6 deja elegir el evento o una fecha.

**Roto se ve así:** Los filtros ocupan dos líneas; un filtro activado desde la hoja no se ve en la línea; los eventos siguen ofreciendo «Aplicar una plantilla» o «Guardar como plantilla»; el podio sigue arriba.
