---
verifier: agent
accounts: fresh
platform: any
data: seed
source: fix/signup-surname-resend
---
# Quien tiene un solo apellido puede crear su perfil

**Preparación:** Una cuenta nueva sin perfil (entra con un correo nuevo por código), en la pantalla «Completar perfil».

**Pasos:**
1. Mira las etiquetas del primer paso.
2. Rellena Nombre (`person-given-name`) y Primer apellido (`person-first-surname`), deja vacío el segundo apellido (`person-second-surname`), elige el sexo y acepta las condiciones. Pulsa «Siguiente».
3. Pon la fecha de nacimiento, sigue y pulsa «Crear perfil».
4. Abre tu perfil y el listado de vecinos del pueblo.

**Esperado:** Paso 1: el campo dice «Segundo apellido (opcional)». Paso 2: pasa al paso de origen y residencia. Paso 3: el perfil se crea; en `persons/{id}` `secondSurname` es `null` y `users/{uid}.displayName` es «Nombre Apellido», sin espacio doble. Paso 4: el nombre se ve sin «undefined», «null» ni hueco al final; las iniciales del avatar son las del nombre y el primer apellido.

**Roto se ve así:** «Siguiente» no hace nada sin decir por qué; o el nombre sale como «Ana García null» o con un espacio de más.
