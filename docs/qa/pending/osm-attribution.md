---
verifier: agent
accounts: any
platform: any
data: seed
source: feat/osm-attribution
---
# Atribuciones acredita a OpenStreetMap

**Preparación:** Cualquier cuenta con sesión iniciada.

**Pasos:**
1. Abre el menú de usuario y baja al apartado Legal.
2. Toca «Atribuciones».
3. Toca «Ver la licencia en openstreetmap.org».

**Esperado:** Paso 1: Legal tiene tres entradas — Términos de uso, Política de privacidad, Atribuciones. Paso 2: se abre la pantalla «Atribuciones» con el título OpenStreetMap, la línea «© OpenStreetMap contributors» y la explicación de que los nombres de pedanías, aldeas, parroquias y barrios vienen de OSM bajo ODbL. Paso 3: el navegador abre openstreetmap.org/copyright.

**Roto se ve así:** falta la entrada en el menú; la pantalla muestra claves sin traducir (`attributions.osm.credit`); o el botón no abre nada.
