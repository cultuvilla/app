/**
 * Mirrors `canReadEvent` in `firestore.rules`: the org pointer, not the
 * `visibility` enum, is the gate. Any non-null `visibilityOrgId` makes an event
 * org-private, whatever the enum says, so a half-written doc fails closed.
 *
 * Takes raw data on purpose: the read site and the triggers read without a
 * converter, so one stale doc cannot break a page. `publicRead.test.ts` and
 * `test/e2e/privateEventRules.test.ts` hold it to the rule.
 *
 * Both fields still exist because the list queries and indexes filter on the
 * enum (`visibility == 'public'`), and the rules keep the two paired on write.
 */
export function isOrgPrivateEvent(raw: { visibilityOrgId?: unknown }): boolean {
  return raw.visibilityOrgId !== undefined && raw.visibilityOrgId !== null;
}
