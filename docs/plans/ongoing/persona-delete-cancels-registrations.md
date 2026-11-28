# Deleting a persona cancels its upcoming registrations

**Priority:** medium

**Landed:** none
**Gate:** none
**Next:** make persona deletion cancel each upcoming registration through the normal cancel path (seats and waitlists move), with tests

Decided 2026-11-28 (Álvaro, `go` to all picks): deleting a persona cancels its upcoming registrations the normal way, no warning step.

**Goal:** when a user deletes one of their personas, its confirmed registrations on
upcoming events are cancelled the way `cancelRegistration` cancels them (counts, waitlist
promotion), instead of staying as registrations for someone who no longer exists.

Found by the referential-integrity audit on prod, 2026-11-27: 5 such registrations on two
events (`referential-integrity-audit.md`). Needs a yes: what the organizer and the owner
see changes (a seat frees up, someone on the waitlist may be promoted), and whether the
owner is warned before deleting is a product call.
