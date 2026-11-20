---
verifier: agent
accounts: admin, member
platform: any
data: seed
source: fix/socio-data-privacy
---
# Añadir un socio a mano pide confirmar su permiso; borrar la cuenta quita el contacto

**Preparación:** Una peña con libro de socios, un admin de la junta y un integrante con cuenta que ha compartido teléfono y email con la junta (y que no sea el único admin).

**Pasos:**
1. Como admin: la peña → Socios → Añadir socio. Escribe un nombre y un teléfono, sin tocar la casilla.
2. Toca Guardar.
3. Marca «Confirmo que esta persona ha dado su permiso para que el grupo guarde sus datos.» y toca Guardar.
4. Abre ese socio → Editar.
5. Como el integrante: Ajustes → Eliminar cuenta, y confírmalo.
6. Como admin: la peña → Socios → abre la ficha de ese integrante.

**Esperado:** Paso 1: la casilla aparece desmarcada bajo el email y Guardar está desactivado. Paso 2: no pasa nada, la hoja sigue abierta. Paso 3: se guarda y el socio aparece en la lista. Paso 4: la hoja de edición no muestra la casilla y guarda sin ella. Paso 6: la ficha sigue ahí con su nombre, número y fecha de alta, ahora con fecha de baja, y ya no muestra su teléfono ni su email.

**Roto se ve así:** se puede guardar sin marcar la casilla; la casilla sale al editar; la casilla queda marcada al volver a abrir «Añadir socio»; tras borrar la cuenta la ficha desaparece, o sigue mostrando teléfono o email.
