// packages/shared/src/services/cuotaService.ts
import { doc, query, serverTimestamp, setDoc, where } from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import {
  organizationCuotaWriteDoc,
  organizationCuotaAssignmentDoc,
  organizationCuotaAssignmentsCollection,
  organizationCuotaPaymentsCollection,
  organizationCuotaRemindersCollection,
  organizationCuotaSettingsDoc,
} from '../firebase/refs/client';
import {
  buildCuotaAssignmentData,
  buildCuotaPaymentData,
  buildCuotaReversalData,
  buildCuotaSettingsData,
  CUOTA_SETTINGS_DOC_ID,
  CuotaAssignmentDataSchema,
  CuotaPaymentDataSchema,
  CuotaSettingsDataSchema,
  reversalIdFor,
  type CuotaAssignmentData,
  type CuotaPaymentData,
  type CuotaPaymentInput,
  type CuotaReminderData,
  type CuotaSettingsData,
  type CuotaSettingsInput,
} from '../models/organization/CuotaDataModel';
import { madridDayKey } from '../models/event/EventDataModel';
import { watchDoc, watchDocsByIds, watchMerged, watchQuery, type Unwatch, type WatchError } from './watch';

export type CuotaSettings = CuotaSettingsData & { id: string };
export type CuotaAssignment = CuotaAssignmentData & { id: string };
export type CuotaPayment = CuotaPaymentData & { id: string };
export type CuotaReminder = CuotaReminderData & { id: string };

// Writes go through unconverted refs so the server stamps the time
// (`serverTimestamp()`, which rules check against `request.time`); the strict
// schema still validates each payload first, with a stand-in Date.
const rawDoc = (orgId: string, collection: 'cuotaSettings' | 'cuotaAssignments' | 'cuotaPayments', id: string) =>
  organizationCuotaWriteDoc(getDb(), orgId, collection, id);

// =============================================================================
// SETTINGS
// =============================================================================

/** The group's cuota, or null while no admin has configured one. Members and admins read it. */
export function watchCuotaSettings(
  orgId: string,
  onNext: (settings: CuotaSettings | null) => void,
  onError: WatchError,
): Unwatch {
  return watchDoc(organizationCuotaSettingsDoc(getDb(), orgId), onNext, onError);
}

/** Admin: create or replace the cuota settings. The saving admin becomes `configuredBy`. */
export async function saveCuotaSettings(
  orgId: string,
  input: Omit<CuotaSettingsInput, 'configuredBy' | 'updatedAt'>,
  adminUid: string,
): Promise<void> {
  const data = CuotaSettingsDataSchema.parse(buildCuotaSettingsData({ ...input, configuredBy: adminUid }));
  await setDoc(rawDoc(orgId, 'cuotaSettings', CUOTA_SETTINGS_DOC_ID), { ...data, updatedAt: serverTimestamp() });
}

// =============================================================================
// ASSIGNMENTS — tier, exemption or custom amount per socio
// =============================================================================

/** Admin: every socio's assignment. */
export function watchCuotaAssignments(
  orgId: string,
  onNext: (rows: CuotaAssignment[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(organizationCuotaAssignmentsCollection(getDb(), orgId), onNext, onError);
}

/** The assignments of the given socio rows — a member's own and their personas'. */
export function watchCuotaAssignmentsOf(
  orgId: string,
  socioIds: string[],
  onNext: (rows: CuotaAssignment[]) => void,
  onError: WatchError,
): Unwatch {
  return watchDocsByIds(
    socioIds,
    (id, next, error) => watchDoc(organizationCuotaAssignmentDoc(getDb(), orgId, id), next, error),
    onNext,
    onError,
  );
}

/** Admin: put a socio on a tier, exempt them, or give them a custom amount. All null/false = the base cuota. */
export async function setCuotaAssignment(
  orgId: string,
  socioId: string,
  input: { tierId: string | null; exempt: boolean; customAmountCents: number | null },
  adminUid: string,
): Promise<void> {
  const data = CuotaAssignmentDataSchema.parse(buildCuotaAssignmentData({ ...input, updatedBy: adminUid }));
  await setDoc(rawDoc(orgId, 'cuotaAssignments', socioId), { ...data, updatedAt: serverTimestamp() });
}

// =============================================================================
// PAYMENTS — append-only ledger
// =============================================================================

/** Admin: every entry of one period (payments and reversals). */
export function watchCuotaPeriodPayments(
  orgId: string,
  periodKey: string,
  onNext: (rows: CuotaPayment[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(query(organizationCuotaPaymentsCollection(getDb(), orgId), where('periodKey', '==', periodKey)), onNext, onError);
}

/**
 * Every entry, all periods, of the given socio rows — a member's history. One
 * query per socio: rules let a member read the entries of the rows they are
 * or answer for, which they can only prove one `socioId` at a time.
 */
export function watchSocioCuotaPayments(
  orgId: string,
  socioIds: string[],
  onNext: (rows: CuotaPayment[]) => void,
  onError: WatchError,
): Unwatch {
  const coll = organizationCuotaPaymentsCollection(getDb(), orgId);
  return watchMerged<CuotaPayment>(
    socioIds.map((id) => (next, error) => watchQuery(query(coll, where('socioId', '==', id)), next, error)),
    (rows) => [...rows].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime()),
    onNext,
    onError,
  );
}

/** Admin: record a payment. Returns the entry id. Entries are never edited — see `reverseCuotaPayment`. */
export async function recordCuotaPayment(
  orgId: string,
  input: Omit<CuotaPaymentInput, 'recordedBy' | 'recordedAt'>,
  adminUid: string,
): Promise<string> {
  const data = CuotaPaymentDataSchema.parse(buildCuotaPaymentData({ ...input, recordedBy: adminUid }));
  const ref = doc(organizationCuotaPaymentsCollection(getDb(), orgId));
  await setDoc(rawDoc(orgId, 'cuotaPayments', ref.id), { ...data, recordedAt: serverTimestamp() });
  return ref.id;
}

/**
 * Admin: cancel a wrongly recorded payment with a reversing entry, dated today.
 * Its id is fixed by the payment's, so a payment can be reversed only once.
 */
export async function reverseCuotaPayment(
  orgId: string,
  payment: CuotaPayment,
  note: string | null,
  adminUid: string,
): Promise<void> {
  if (payment.kind !== 'payment') throw new Error('Only a payment can be reversed');
  const data = CuotaPaymentDataSchema.parse(
    buildCuotaReversalData(payment, { paidOn: madridDayKey(new Date()), note, recordedBy: adminUid }),
  );
  await setDoc(rawDoc(orgId, 'cuotaPayments', reversalIdFor(payment.id)), { ...data, recordedAt: serverTimestamp() });
}

// =============================================================================
// REMINDERS — written by the sendCuotaReminders job
// =============================================================================

/** Admin: the reminders sent for one period. */
export function watchCuotaPeriodReminders(
  orgId: string,
  periodKey: string,
  onNext: (rows: CuotaReminder[]) => void,
  onError: WatchError,
): Unwatch {
  return watchQuery(query(organizationCuotaRemindersCollection(getDb(), orgId), where('periodKey', '==', periodKey)), onNext, onError);
}
