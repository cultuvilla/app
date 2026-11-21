- Change: los avisos de un grupo ya no suenan en el móvil. Siguen llegando al
  grupo y al Buzón, con su punto de no leído, y por email a quien no tiene la
  app; lo que sí notifica en el móvil es lo que escribe la propia app (cuota,
  tareas, eventos, solicitudes) y las conversaciones (Charla, comentarios). Con
  ello desaparecen el botón «Recordárselo a quien no lo ha leído», el
  interruptor «Avisos de la junta» de Ajustes → Notificaciones y el nivel
  «Nada» de cada grupo, que solo silenciaba esos avisos. **Migration:** none
  (`nudgeGroupMessage` stays callable for installed binaries; delete it once
  `minSupported` passes this release).
- Feature: «Enviar avisos», un ajuste nuevo del grupo en «Qué pueden hacer los
  socios», apagado en todos los grupos. Con él, cualquier socio envía desde
  Avisos un aviso a todos los socios: solo texto, solo en la app.
  **Migration:** `organizations.sociosSendAvisos` (false) is written by
  `scripts/backfill-org-socios-send-avisos.mjs`, which the deploy applies itself
  (pre-deploy, autoApply).
