# Non-production never reaches real people

**Priority:** high
**Landed:** beta
**Gate:** soak:first `Delivery withheld outside production` log line on dev and on beta (no probe write; decided by the leader 2026-11-27 pending Álvaro)
**Next:** read Cloud Logging on villa-events and cultuvilla-beta for `Delivery withheld outside production`; one line from each env retires this plan

State 2026-11-27: #754 merged (guard in `functions/src/shared/deliveryAudience.ts`, asked by sendEmail/sendEmailBatch and deliverPush; decision record `docs/decisions/non-production-never-reaches-real-people.md`). Dev deployed by CI. Beta deployed by hand from origin/beta 82439de4 plus the two guard commits, so beta's functions run ahead of the beta branch until the next promotion.

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
