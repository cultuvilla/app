# Grupos — money members report themselves

**Priority:** high — the gap La Anduela's 2026 accounts keep falling into

> Idea from a session on 2026-10-31, built on the shipped
> [group-toolkit](../ongoing/group-toolkit.md) Phases 3 and 5. The requirements come
> from the La Anduela treasurer's private record (`la-anduela` repo): what is quoted
> here is the *shape* of its problems, never its data.

## Why

Today only an org admin can record a cuota payment (`cuotaPayments` create is
`isOrgAdmin` in `firestore.rules`) or an income/expense (`ledgerEntries`). Real money
in a village asociación moves through many hands:

- **Socios pay and nobody writes it down.** A Bizum or a transfer the treasurer only
  learns of when the bank statement arrives, months later.
- **Cash is collected by whoever is there.** A vocal or a neighbour takes a dozen
  cuotas in hand at the fiestas; weeks later nobody remembers who holds the money or
  where it was banked. La Anduela's 2026 close still has open questions of exactly
  this kind.
- **Expenses are advanced by neighbours.** Someone buys the bread, the wood or the
  flowers for the matanza and is paid back later. The ticket is lost, so the movement
  has no justificante.

WhatsApp cannot keep any of this. A durable "who paid, who holds it, what backs it"
record is the thing the app is better at.

## What we're building

1. **"He pagado"** on the member's cuota card (`MyCuota`): method, date, amount
   (prefilled with what they owe), optional note and photo of the Bizum/transfer
   receipt. Also for the personas a cargo the member answers for.
2. **"He cobrado"** for an admin or a member the junta enables: record cuotas taken
   in cash on someone else's behalf. The money is then *in that person's custody*.
3. **Custody view** in Gestionar: cash held by each person, until the treasurer marks
   it *ingresado* (deposited) — the open "en manos de …" balance per person.
4. **Gastos adelantados:** a member submits an expense they paid (amount, concept,
   activity/event, photo of the ticket). The treasurer approves → it becomes a
   `ledgerEntries` expense with the receipt attached, plus a *pendiente de devolver*
   balance owed to that member until marked repaid.

## Decisions

- **Decided 2026-10-31 (user): a reported payment counts right away; the treasurer
  can reverse it.** The status turns *al día* the moment the socio reports, so the
  socio is not chased again; any admin can annul it with the existing reversal entry
  (`rev_<paymentId>`). The entry records who reported it (`reportedBy`, `kind`
  self-reported vs recorded) so the treasurer can filter "reported, not yet seen in
  the bank" and tick them off.
- Reminders keep skipping anyone *al día*, so a reported payment stops them too.

## Open questions

- Is "He cobrado" any member's, or only the junta's plus members an admin enables?
  (Pick: junta + enabled members — custody is a trust relation.)
- Does an advanced expense need approval before it counts, unlike payments?
  (Pick: yes — an expense spends the group's money; a payment adds to it.)
- Receipt photos: Storage path under `organizations/{orgId}/receipts/…`, readable by
  admins and the uploader only. Retention?
- Export: add `reportedBy` / custody columns to the cuota and year exports, so a
  treasurer's own books (beancount, a spreadsheet) can import them.

## Touches

`CuotaDataModel` (payment `kind`/`reportedBy`), `firestore.rules` (member create on
own `isMySocioRow` rows), `RecordsDataModel` (`ledgerEntries` receipt + approval),
`MyCuota`, `CuotaAdmin`, `YearSummaryAdmin`, exports in `packages/shared/src/export/`.
A stored-schema change → registered backfill if a field becomes required.
