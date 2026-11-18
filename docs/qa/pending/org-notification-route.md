---
verifier: agent
accounts: admin+user
platform: any
data: seed
source: fix/org-notification-route
---
# Pulsar «Organización aprobada» abre el grupo; «rechazada» abre el pueblo, nunca el formulario de crear

**Preparación:** User propone dos grupos en Altozano (Crear → grupo).

**Pasos:**
1. Como admin: Buzón → Necesita tu acción; aprueba el primero y rechaza el segundo.
2. Como user: Buzón → actividad; pulsa «Organización aprobada».
3. Atrás; pulsa «Organización rechazada».

**Esperado:** La aprobada abre la ficha del grupo aprobado (`/<pueblo>/entidad/_<id>`); la notificación en `users/<uid>/notifications/<nid>` tiene `entityKind` = `organization` y `entityId` = el id del grupo. La rechazada abre la portada del pueblo (`entityId` = null).

**Roto se ve así:** Cualquiera de las dos abre «Añadir grupo» (`/<pueblo>/entidades`).
