---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: feat/socios-screen-junta
---
# Socios: un solo «Añadir socio» y una junta directiva editable

**Preparación:** Asociación de la semilla (`e2e-org-asociacion`) con al menos un socio con la app que no sea de la junta (`e2e-user`). Entra como admin.

**Pasos:**
1. Abre Socios del grupo. Mira el orden de la pantalla.
2. Toca «Añadir socio» y elige «Alguien sin la app»; da de alta a «Prueba QA».
3. Toca «Añadir socio» y elige «Una persona a tu cargo».
4. En Junta directiva toca «Añadir a la junta», elige a `e2e-user` y luego «Vocal».
5. Toca la cara de `e2e-user` en la junta → «Cambiar cargo» → «Tesorería».
6. Toca otra vez su cara → «Quitar de la junta» y confirma.
7. Toca tu propia cara.
8. Entra como `e2e-user` y abre Socios.

**Esperado:** Paso 1: tu ficha (sin botón de personas debajo), consentimiento, solicitudes, puerta «Libro de socios», un solo «Añadir socio», Junta directiva, y la lista con el título «Socios». Paso 2: aparece el formulario de socio sin la app y «Prueba QA» entra en la lista. Paso 3: se abre el selector de personas a cargo. Paso 4: `e2e-user` aparece en la junta como «Vocal». Paso 5: su cargo pasa a «Tesorería». Paso 6: tras confirmar, desaparece de la junta. Paso 7: solo se ofrece «Cambiar cargo», nunca quitarte. Paso 8: «Añadir socio» abre directamente el selector de personas a cargo; en la junta no hay botón «Añadir a la junta» y tocar una cara no hace nada.

**Roto se ve así:** dos botones de añadir; el menú no sale para el admin o sale para el socio; alguien entra en la junta sin cargo cuando se eligió uno; un admin puede quitarse a sí mismo.
