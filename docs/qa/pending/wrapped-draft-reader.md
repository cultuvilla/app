---
verifier: agent
accounts: fresh
platform: any
data: seed
source: fix/firebase-error-code-lint
---
# Un resumen de fiestas en borrador no da error a quien no administra el pueblo

**Preparación:** Un pueblo con un Wrapped del año en estado `draft` (créalo como admin desde *Resumen* sin publicarlo). Una segunda cuenta que no sea admin de ese pueblo.

**Pasos:**
1. Con la cuenta que no es admin, abre `/<pueblo>/fiestas/<año>` (enlace o desde el pueblo).

**Esperado:** La pantalla de fiestas de ese año sin resumen (el programa, o «todavía no hay resumen» con el botón para ir al pueblo). Ningún mensaje de error.

**Roto se ve así:** Aparece la pantalla de error con «Reintentar»: el móvil recibe `firestore/permission-denied` y la app lo trataba como un fallo.
