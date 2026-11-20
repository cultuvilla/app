---
verifier: agent
accounts: admin+user
platform: android
data: seed
source: buzon-badge-all-actions
---
# La campana cuenta también las solicitudes de unión y las denuncias abiertas

**Preparación:** En Altozano, el admin administra el pueblo y un grupo con `joinPolicy` por solicitud. Sin notificaciones sin leer.

**Pasos:**
1. Como user: pide unirte a ese grupo, y denuncia una noticia del pueblo.
2. Como admin: vuelve a una pantalla con cabecera (Inicio) y mira el número de la campana.
3. Abre el Buzón → Necesita tu acción.
4. Resuelve la solicitud de unión y la denuncia; vuelve a Inicio.

**Esperado:** En el paso 2 la campana suma 2 (la solicitud y la denuncia), el mismo total que lista *Necesita tu acción* (la fila de denuncias del pueblo cuenta 1). Tras resolverlas, la campana baja a 0. Las solicitudes de la cosateca no suman en la campana.

**Roto se ve así:** La campana sigue en 0 con la solicitud o la denuncia pendientes, o su número no coincide con lo que lista el Buzón.
