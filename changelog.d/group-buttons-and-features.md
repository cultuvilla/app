- A group's home shows the same buttons to everyone: an admin now gets «Actas» and
  «Cuentas» like any socio, opening the editable books, and «Registros» is gone (the
  libro de socios is reached from «Socios»). The admin-only buttons say what they do:
  «Cobrar cuota» and «Enviar avisos». «Eventos» and «Tareas» have their own buttons,
  unread avisos carry a dot, a group's event shows as a card with its flyer, and the
  events filter is just «Próximos» and «Pasados».
- Ajustes opens with «Qué usa el grupo»: an admin switches the cuota and the cosateca
  on or off. With the cuota off its buttons, banner and reminders disappear; its
  payments are kept. **Migration:** `organizations.cuotaEnabled` is set to `true` where
  missing by `scripts/backfill-org-cuota-enabled.mjs` (pre-deploy, auto-applied).
