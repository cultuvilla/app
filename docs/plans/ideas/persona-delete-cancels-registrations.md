# Deleting a persona cancels its upcoming registrations

**Priority:** medium

**Goal:** when a user deletes one of their personas, its confirmed registrations on
upcoming events are cancelled the way `cancelRegistration` cancels them (counts, waitlist
promotion), instead of staying as registrations for someone who no longer exists.

Found by the referential-integrity audit on prod, 2026-11-27: 5 such registrations on two
events (`referential-integrity-audit.md`). Needs a yes: what the organizer and the owner
see changes (a seat frees up, someone on the waitlist may be promoted), and whether the
owner is warned before deleting is a product call.
