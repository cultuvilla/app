---
verifier: human
accounts: user
platform: any
data: seed
source: full-pass-2026-11-18
---
# Un aviso de grupo llega como notificación al móvil y abre el aviso

**Preparación:** Móvil real con la app de beta, integrante de un grupo; otra persona admin del grupo.

**Pasos:**
1. El admin envía un aviso con push.
2. Toca la notificación.

**Esperado:** Llega la notificación con el título del aviso y abre su pantalla.

**Roto se ve así:** No llega, llega sin texto, o abre la portada.
