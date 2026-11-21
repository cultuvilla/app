---
verifier: agent
accounts: admin, member
platform: any
data: seed
source: feat/barrio-kind-picker
---
# El equipo del pueblo elige el tipo al añadir un barrio

**Preparación:** Un pueblo activo con un admin (Equipo del pueblo o Embajador) y un integrante normal.

**Pasos:**
1. Como admin: portada del pueblo → Añadir contenido → barrio. Escribe «Prueba Localidad», toca el chip «Localidad» y guarda.
2. Vuelve a la portada y busca la sección Localidades.
3. Como integrante normal, abre el mismo formulario.

**Esperado:** Paso 1: bajo el nombre aparece «Tipo» con cuatro chips — Barrio (marcado por defecto), Localidad, Aldea, Parroquia. Paso 2: «Prueba Localidad» aparece en Localidades, no en Barrios. Paso 3: no hay chips de tipo; lo que crea va a Barrios.

**Roto se ve así:** el admin no ve chips; elige Localidad y la fila acaba en Barrios; el integrante ve chips; o guardar como integrante falla con un error de permisos.
