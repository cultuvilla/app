# Village fiestas Wrapped — what is left

**Priority:** low

The Wrapped is built, published and shared; its rationale is in
[village-fiestas-wrapped.md](../../decisions/village-fiestas-wrapped.md). This
file holds only the open work.

## Personal cards

Add a personal layer: the events you and your personas signed up for, above a
floor of about two sign-ups, and the village Wrapped below that floor. It is the
most shareable thing the Wrapped could add, and it needs a per-user render or a
client-side card.

## The participants with no village link

In Matabuena 2026, 33 people took part but are missing from the people wall.
The wall is the censo, and these are mostly personas a parent created without
setting a village. This needs a product call between three options:

- draw them on the wall anyway;
- prompt parents to set their family's residence;
- leave the wall as the censo.

## Tuning

`AUTO_PUBLISH_GRACE_DAYS` (3) and the auto-publish floor (3 events and at least
one sign-up) should be tuned against the first season with several villages.

## Past years on the village page

`/<pueblo>/fiestas/<año>` already resolves for any year, but the village home
only shows the newest published Wrapped (the map-shaped strip). A "Fiestas de otros años"
list belongs there once a village has more than one year.
