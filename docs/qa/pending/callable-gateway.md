---
verifier: agent
accounts: fresh
platform: any
data: seed
source: feat/callable-gateway
---
# Las acciones del servidor siguen funcionando a través de la pasarela (beta)

**Preparación:** La app Cultuvilla Beta con un bundle que ya llama a la pasarela (OTA de beta tras este cambio). Una cuenta de prueba en beta.

**Pasos:**
1. Cierra sesión y entra con correo: pide el código y escríbelo.
2. Apúntate a un evento con inscripción y luego cancela la inscripción.
3. En un grupo, pide unirte (o, como admin, acepta una solicitud).
4. Busca una dirección al crear un lugar (geocodificación).

**Esperado:** Todo funciona igual que antes, sin errores. En los logs de Cloud Run de `cultuvilla-beta`, servicio `callablegateway` (región `europe-southwest1`), aparece un `200` por cada acción, en la ruta `/sendAuthOtpCode`, `/verifyAuthOtpCode`, `/registerToEvent`, `/cancelRegistration`…

**Roto se ve así:** Cualquier acción falla con «No se pudo…», o en los logs aparece `401` con «The access token could not be verified» (el permiso público aún no se ha propagado tras el primer despliegue) o `404 Unknown callable`.
