---
verifier: agent
accounts: user
platform: android
data: seed
source: full-pass-2026-11-18
---
# La cosateca del pueblo lista lo que prestan los grupos y lleva a pedirlo

**Preparación:** Algún grupo con cosateca activa y un objeto ofrecido (flujo 15 crea uno; si no, ofrécelo como admin).

**Pasos:**
1. Mi pueblo → cosateca.
2. Abre un objeto y pide el préstamo.

**Esperado:** La lista muestra el objeto con su grupo; la petición queda en Firestore y el dueño la ve.

**Roto se ve así:** Lista vacía con objetos ofrecidos, o la petición no llega.
