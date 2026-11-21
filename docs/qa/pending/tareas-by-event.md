---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: develop (tareas-by-event)
---
# Tareas: una línea por tarea, agrupadas por evento, con filtros y «Quién más ayuda»

**Preparación:** En un grupo de la semilla, como admin, crea un evento próximo con dos tareas (una asignada a `e2e-user`, otra sin asignar) y una tarea suelta sin evento. Marca como hecha una tarea asignada a `e2e-user`.

**Pasos:**
1. Entra como `e2e-user` y abre Tareas del grupo.
2. Toca la cabecera del segundo grupo, y luego la del primero.
3. Toca el filtro «Mías»; luego añade «Hechas»; luego quítalos.
4. Marca una tarea como hecha con su casilla.
5. Toca la tira de arriba («… lleva N tareas este año»), y en la hoja toca el evento en las fichas de periodo.
6. Toca «Hay N tareas sin asignar · Ver».
7. Cierra la app, vuelve a abrir Tareas.

**Esperado:** En el paso 1 hay una tira con caras arriba y una fila de filtros (ninguno activo); debajo, el evento con «N de M hechas» y una barra, abierto, con cada tarea en una línea (casilla, título, fecha, caras), y «Otras tareas» al final, cerrado. El paso 2 abre y cierra cada grupo. En el paso 3 «Mías» deja solo tus tareas, con todos sus grupos abiertos, y «Hechas» las que hiciste. En el paso 4 la tarea sale de la lista y el progreso del evento sube. En el paso 5 sales tú resaltado («Tú») con tu barra y, debajo, cuánto te falta para pasar al siguiente; nadie aparece con 0. En el paso 6 se cierra la hoja y queda activo el filtro «Sin asignar». En el paso 7 sigue activo ese filtro.

**Roto se ve así:** Las tareas salen en tarjetas a dos columnas; un grupo cerrado no dice su progreso; el filtro no se combina o no se recuerda; un integrante sin admin no ve la tira; alguien sale con 0 tareas.
