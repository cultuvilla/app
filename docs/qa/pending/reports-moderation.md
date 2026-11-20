---
verifier: agent
accounts: superadmin+admin
platform: any
data: seed
source: fix/reports-moderation
---
# El superadmin ve las denuncias de todos los pueblos, y nadie resuelve una denuncia sobre algo suyo

**Preparación:** Denuncias abiertas en dos pueblos distintos (denuncia un comentario o un mensaje como un usuario cualquiera en cada uno). En uno de ellos, una denuncia contra un comentario escrito por un admin de ese pueblo.

**Pasos:**
1. Como superadmin sin pueblo activo, abre Admin → Denuncias.
2. Como el admin del pueblo cuyo comentario se denunció, abre las Denuncias del pueblo (Buzón → Necesita tu acción, o el pueblo → Denuncias).
3. Como superadmin, mira esa misma denuncia en Admin → Denuncias.

**Esperado:** Paso 1: aparecen las denuncias de los dos pueblos, cada fila con el nombre de su pueblo arriba, la más reciente primero; nunca «Elige un pueblo activo». Paso 2: en la denuncia sobre su propio comentario no hay «Borrar el comentario», «Descartar» ni «Marcar como revisada», y pone «Es sobre algo tuyo, así que tiene que revisarla otra persona del equipo.»; las demás denuncias sí tienen sus botones. Paso 3: el superadmin sí puede descartarla o marcarla revisada (`contentReports/{id}.status` cambia).

**Roto se ve así:** Admin → Denuncias vacío o pidiendo un pueblo; filas sin nombre de pueblo; o el autor del contenido ve y puede pulsar los botones para cerrar su propia denuncia.
