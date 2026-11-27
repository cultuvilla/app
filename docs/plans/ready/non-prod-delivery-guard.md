# Non-production never reaches real people

**Priority:** high

**Decided 2026-11-27 (Álvaro):** yes — from the Órdago harvest.

**Goal:** outside prod, mail and push reach only accounts that exist in that project's
Auth. Today `functions/src/shared/email.ts` and `functions/src/push/fcmTransport.ts`
skip only in the emulator, so data mirrored or seeded on dev/beta can mail or push a real
address.

Source: `~/githubs/ordago-app/ordago-apps` `docs/decisions/non-production-never-reaches-real-people.md`.

## Done when

One guard both transports call, keyed on the project (prod sends to anyone; dev and beta
only to their own Auth users, and beta's real testers are those), logged when it drops a
send, tested. A decision record states the rule.
