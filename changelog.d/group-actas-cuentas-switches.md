- A group with socios can now switch its Actas and its Cuentas off in Ajustes, under
  «Qué usa el grupo», next to Cuota and Cosateca. Off hides their buttons, their
  doors and the cuentas line of the asamblea checklist
  (and the «Cuentas» visibility switch); nothing written is deleted, and turning them
  back on brings it all back. **Migration:** `scripts/backfill-org-records-enabled.mjs`
  sets both on for every existing group (per env; the deploy applies it).
