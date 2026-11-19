---
verifier: agent
accounts: admin, user
platform: any
data: seed
source: fix/grupo-copy-plurals
---
# Las notificaciones de grupos dicen «grupo», y los «1 …» van en singular

**Preparación:** Un usuario miembro de un pueblo y el admin de ese pueblo (o super admin). Una palabra del vocabulario recogida en un solo pueblo y con un solo significado en otro pueblo. Un barrio con un solo vecino.

**Pasos:**
1. Como usuario, solicita crear un grupo nuevo en el pueblo. Como admin, apruébalo. Vuelve al usuario y abre el Buzón.
2. Repite con otro grupo y recházalo.
3. Como otro miembro del pueblo, mira el Buzón tras la aprobación del paso 1.
4. En Mi pueblo → Vocabulario → añadir palabra, escribe la palabra recogida en un solo pueblo; mira la sugerencia y la pantalla de unirse a ella. Abre una palabra y mira «En otros pueblos».
5. En la web del pueblo, abre la página del barrio con un vecino.

**Esperado:** Paso 1: «Grupo aprobado» — «Tu grupo "…" fue aprobado.». Paso 2: «Grupo rechazado» — «Tu grupo "…" fue rechazado.». Paso 3: «Nuevo grupo en <pueblo>». Paso 4: «en 1 pueblo», «recogida en 1 pueblo.» y «1 significado». Paso 5: «Barrio · 1 vecino».

**Roto se ve así:** aparece «Organización aprobada», «Nueva organización» o «Tu organización»; o se lee «1 pueblos», «1 significados» o «1 vecinos».
