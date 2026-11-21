---
verifier: agent
accounts: admin, user
platform: any
data: seed
source: refactor/entity-capability-policy
---
# El autor de una palabra oculta ya no ve una papelera que no funciona

**Preparación:** En un pueblo con Vocabulario, un vecino (no admin) añade una palabra nueva sin significados (o borra el único que tenía, si la pantalla lo permite antes de que se borre la palabra). Un admin del pueblo oculta esa palabra (moderación).

**Pasos:**
1. Como el vecino autor, abre la palabra oculta desde su enlace o desde Vocabulario.
2. Como el mismo vecino, abre otra palabra suya activa sin significados.
3. Como admin del pueblo, abre la palabra oculta.

**Esperado:** Paso 1: no hay papelera en la cabecera. Paso 2: la papelera sí aparece y borra la palabra. Paso 3: el admin ve la papelera y puede borrarla.

**Roto se ve así:** en el paso 1 aparece la papelera y al pulsarla no pasa nada o sale un error de permisos.

**Pasada 2026-11-21 (Android, agente):** ⏭ «Añadir palabra» exige un significado, así que la app no deja crear una palabra sin significados: hace falta crearla a mano en Firestore antes del paso 1.
