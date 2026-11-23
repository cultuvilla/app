---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: develop
---
# Tareas: la fecha en rojo sin «Vencida» y el podio como tarjeta al final

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`), que tiene alguna tarea hecha este año. Crea una tarea con fecha de ayer y sin marcarla como hecha. Abre la pantalla Tareas del grupo.

**Pasos:**
1. Busca la tarea de ayer en la lista.
2. Baja hasta el final de la pantalla.
3. En la tarjeta «Quién más ayuda», toca «Este mes» y luego un evento.
4. Si aparece «Hay N tareas sin asignar · Ver», tócalo.

**Esperado:** En el paso 1 la fecha de la tarea sale en rojo y en negrita, y la palabra «Vencida» no aparece en ningún sitio. En el paso 2 la pantalla termina en una tarjeta «Quién más ayuda» con la lista entera (puesto, foto, barra y número), sin tener que abrir otra pantalla. El paso 3 cambia la lista dentro de la misma tarjeta. El paso 4 filtra la lista por «Sin asignar».

**Roto se ve así:** Delante de la fecha pone «Vencida ·»; toda la línea sale en rojo; al final hay una franja con caras que abre otra pantalla.
