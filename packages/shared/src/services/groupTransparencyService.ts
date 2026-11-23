// packages/shared/src/services/groupTransparencyService.ts
import { httpsCallable } from '../firebase/sdk/functions';
import { getFirebaseFunctions } from '../firebase';
import type {
  GetGroupTransparencyInput,
  GetGroupTransparencyResult,
  TransparentAvisosResult,
  TransparentCuentasResult,
  TransparentCuotaResult,
} from '../models/organization/GroupTransparencyModel';

/**
 * What a group's junta has made public to its integrantes, served by the
 * `getGroupTransparency` callable with only the fields socios may see. The
 * switches themselves are `organizations.transparency`, written with
 * `organizationService.updateOrganization`; the ledger, which hides nothing,
 * is read with `recordsService.watchLedgerEntriesForYear` once `cuentas` is on.
 */
async function call<R extends GetGroupTransparencyResult>(input: GetGroupTransparencyInput): Promise<R> {
  const fn = httpsCallable<GetGroupTransparencyInput, GetGroupTransparencyResult>(getFirebaseFunctions(), 'getGroupTransparency');
  return (await fn(input)).data as R;
}

/** The current period's socios, each one's name and al día / pendiente. */
export function fetchTransparentCuota(orgId: string): Promise<TransparentCuotaResult> {
  return call<TransparentCuotaResult>({ orgId, view: 'cuota' });
}

/** Every aviso the junta sent, newest first, with its poll's results. */
export function fetchTransparentAvisos(orgId: string): Promise<TransparentAvisosResult> {
  return call<TransparentAvisosResult>({ orgId, view: 'avisos' });
}

/** The cuota's income in a year, as totals per period. */
export function fetchTransparentCuotaIncome(orgId: string, year: string): Promise<TransparentCuentasResult> {
  return call<TransparentCuentasResult>({ orgId, view: 'cuentas', year });
}
