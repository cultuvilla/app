# Groups talk in the app; email and WhatsApp are bridges into it

Decided 2026-11-01 by Álvaro, while building Phase 4 of
[group-toolkit](../plans/ongoing/group-toolkit.md).

## Decision

- **WhatsApp only through `wa.me` links** the admin sends from their own phone. No WhatsApp
  Business or Cloud API.
- **No sending email as the group's own address.** "Conectar Gmail" and Gmail OAuth sending
  are dropped.
- **The app is the communication platform.** Email and WhatsApp bring people into it; they
  are not channels to perfect. Prefer features that move the conversation into the app:
  links from an email or a WhatsApp message to the aviso, in-app replies.

## Why

For La Anduela, with about 200 socios and most without the app at first, a marketing-category
API broadcast costs about €14 per message to all of them (Meta Spain about €0.0585 a message,
plus VAT). That is too expensive. Who the email appears to come from matters less than
pulling people into the app.

## What this binds

Don't propose the Meta API or Gmail sending again unless Álvaro raises it. Socios without the
app are reached as typed socios loaded by the import script.
