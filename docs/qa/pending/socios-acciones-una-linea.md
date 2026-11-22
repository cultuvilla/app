---
verifier: agent
accounts: admin
platform: any
data: seed
source: develop
---
# Socios: «Añadir socio» y «Añadir a la junta» en una línea, y el menú de añadir con iconos

**Preparación:** Entra como admin de la asociación de la semilla (`e2e-org-asociacion`) y abre Socios.

**Pasos:**
1. Mira los botones de añadir, encima de la junta.
2. Toca «Añadir socio».
3. Cierra la hoja y toca «Añadir a la junta».

**Esperado:** En el paso 1 «Añadir socio» y «Añadir a la junta» están uno al lado del otro, del mismo ancho, y el encabezado «Junta directiva» ya no lleva botón. En el paso 2 la hoja «¿A quién añades?» muestra cada opción como una fila con icono naranja, título en negrita, su explicación debajo y una flecha a la derecha, separadas por líneas (como «Añadir contenido» en un pueblo). El paso 3 abre la lista de socios con la app que puedes añadir.

**Roto se ve así:** Los dos botones están en sitios distintos; la hoja de «Añadir socio» sigue siendo texto suelto sin iconos.
