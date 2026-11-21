- New: programa de fiestas. Any village member can add the days of a fiesta for
  the year (the proposer and the village admins can correct them), and an event
  dated in those days can join its programme from the event form (on by
  default). `/<pueblo>/fiestas/<año>` now shows the programme day by day, in the
  app and on the web, until that year's Wrapped is published, which then keeps
  the programme a tap away. The village home shows the programme in the weeks
  before and during the fiestas, and asks members for the days in the month
  they are due. The Wrapped create form starts from those days.
  **Migration:** `events.fiestaEditionId` is seeded to null by the registered
  pre-deploy backfill `scripts/backfill-event-fiesta-edition.mjs` (autoApply on
  every env).
