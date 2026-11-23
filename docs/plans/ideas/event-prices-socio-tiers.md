# Event prices, socio and non-socio

**Priority:** medium — closes the "event income" gap left by group-toolkit Phase 5

> Idea from a session on 2026-10-31. Source: how La Anduela runs its two big meals.

## Why

An asociación's biggest money movements are its own events — the matanza and the
summer meal — where socios eat as part of the cuota and **non-socios pay per head,
with an adult and a child price**. Events today carry no price: only
`requiresPayment` plus a hand-marked `registration.paidAt`. So
[group-toolkit](../ongoing/group-toolkit.md) Phase 5's yearly summary cannot include
event income, and tells the treasurer to type it in by hand.

## What we're building

- **Price tiers on an event:** socio / no socio, adult / child (under N years), each
  in euro cents; free for socios is a tier of 0.
- **Registration picks the tier** — a socio's own rows resolve from the roster; the
  member adds non-socio guests with a head count per tier.
- **Who paid:** the existing `paidAt`, plus method; self-reported like cuotas once
  [group-member-reported-money](group-member-reported-money.md) lands.
- **Event money in the group's year summary**, per event, instead of a manual entry —
  which needs org admins to read their org events' registrations (they can't today).

## Open questions

- Raffles (rifa) and other in-event income: a free-form income line on the event?
- Public events: does the price show on the read site? (Probably yes, as text.)
