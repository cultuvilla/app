---
verifier: agent
accounts: admin+user
platform: android
data: seed
source: full-pass-2026-11-18
---
# El Buzón se vacía en cuanto se resuelve lo pendiente, y quien lo pidió se entera

**Preparación:** User propone un grupo (Crear → grupo) en Altozano.

**Pasos:**
1. Como admin: Buzón → Necesita tu acción muestra la propuesta; apruébala.
2. Como user: Buzón → actividad.

**Esperado:** La propuesta desaparece del Buzón del admin sin recargar; el user ve la aprobación en su actividad y al pulsarla abre el grupo. `organizations/<id>.status` = `approved`.

**Roto se ve así:** Lo resuelto se queda en el Buzón, o la notificación no lleva a ninguna parte.
