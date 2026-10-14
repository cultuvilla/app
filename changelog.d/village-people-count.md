- New: visitors see how many people a village has again. The count had shown
  as "—" to anyone who was not a member since July; it is now kept on the
  village itself, so every viewer sees the same number. **Migration:**
  `scripts/backfill-village-people-count.mjs` sets `municipalities.peopleCount`
  (auto-applied per env by the deploy).
