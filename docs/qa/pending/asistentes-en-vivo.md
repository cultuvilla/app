---
verifier: agent
accounts: user
platform: any
data: seed
source: fix/attendees-live
---
# La lista de «Asistentes» cambia al apuntarte o desapuntarte, sin salir del evento

**Preparación:** Como user (`e2e-user`), abre un evento con la lista de asistentes visible para el pueblo y sin nadie apuntado — p. ej. «Inscripción Completa E2E» (`e2e-event-inscripcion`, `attendeesVisibility: members`) en una semilla limpia.

**Pasos:**
1. En el detalle del evento, baja hasta «Asistentes»: dice «Aún no hay asistentes».
2. Apúntate con el botón flotante (rellena lo que pida) y vuelve al detalle.
3. Sin salir ni recargar, mira «Asistentes».
4. Desapúntate desde el mismo botón y vuelve a mirar.

**Esperado:** Tras el paso 2 el botón dice «Apuntado (1)» y la lista pasa a «Asistentes (1)» con tu nombre y la hora de inscripción. Tras el paso 4 vuelve a «Aún no hay asistentes». `events/e2e-event-inscripcion/registrations/<id>` aparece y desaparece.

**Roto se ve así:** El botón dice «Apuntado (1)» y la lista sigue en «Aún no hay asistentes»; o, tras desapuntarte, sigue «Asistentes (1) <tu nombre>» hasta salir y volver a entrar.
