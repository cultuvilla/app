# Cuota tiers by age

**Priority:** medium — cheapest of the La Anduela synergies

> Idea from a session on 2026-10-31.

## Why

Many asociaciones charge a reduced cuota until an age (La Anduela: 6 € until 16,
12 € from the year the socio turns 16, no proration). Today a
[group-toolkit](../ongoing/group-toolkit.md) tier is assigned by hand per socio
(`cuotaAssignments`), so the treasurer must notice every birthday — which is how
yearly 6 € differences creep in.

## What we're building

- A tier may carry an **age rule**: `untilAge` and whether it is the age *reached in
  the period's year* (La Anduela) or at the due date.
- `computeCuotaStatuses` resolves the tier from the socio's birth year: member rows
  through the user's own persona, persona rows through `persons.birthday`
  (`PartialDate`, the year is enough). Typed socios and anyone without a birth year
  fall back to the hand assignment.
- Gestionar shows "cambian de tramo este año" so the treasurer can tell those socios.

## Open questions

- Privacy: the junta sees only the resolved tier, never the birth date.
- A hand assignment always wins over the age rule? (Pick: yes.)
