- A peña, asociación or group of "otros" can now be in several pueblos: its
  admins ask another pueblo from the group's settings (Pueblos → Añadir pueblo),
  that pueblo's Equipo accepts it in the Buzón, and from then on it shows among
  that pueblo's groups as «De <su pueblo>». Its page says where else it is; either
  side can take it out again. **Migration:** `scripts/backfill-org-municipality-ids.mjs`
  lists every group in its own pueblo (`organizations.municipalityIds`); it runs by
  itself on each deploy (pre-deploy, autoApply).
