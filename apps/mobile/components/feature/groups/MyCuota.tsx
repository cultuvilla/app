import type { ReactNode } from 'react';
import { cuotaConcept, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import { VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { centsLabel, todayKey } from '../../../lib/orgs/cuota';
import { cuotaReceipt, paidEntries } from '../../../lib/orgs/cuotaReceipt';
import { useMyCuota } from '../../../lib/orgs/useMyCuota';
import { CuotaPaidList, CuotaPayWith, CuotaReceiptCard, type ReceiptLine } from './CuotaReceipt';

/**
 * A member's cuota as a receipt: one card for everything they answer for this
 * period (their own row and their personas a cargo), how to pay with copy
 * buttons while something is owed, and the payments already made. Hidden (or
 * `empty`) until an admin configures the cuota.
 */
export function MyCuota({ orgId, uid, empty }: { orgId: string; uid: string; empty?: ReactNode }) {
  const { t } = useT();
  const { cuota, periodKey, rows, payments, statuses, settled } = useMyCuota(orgId, uid);

  if (!cuota || !periodKey || rows.length === 0 || !settled) return settled && empty ? <>{empty}</> : null;

  const nameOf = (socioId: string | null) => rows.find((r) => r.id === socioId)?.displayName ?? '';
  const own = rows.find((r) => r.kind === 'member') ?? rows[0];
  const receipt = cuotaReceipt(statuses, todayKey());

  const detailOf = (s: SocioCuotaStatus): string => {
    if (s.basis === 'household') {
      return s.householdOf === own?.id ? t('groups.myCuota.inYours') : t('groups.cuota.household', { name: nameOf(s.householdOf) });
    }
    if (s.basis === 'exempt') return t('groups.cuota.exempt');
    const status = t(`groups.cuota.status.${s.status}`);
    return s.status === 'al_dia' ? status : `${centsLabel(Math.max(0, s.owedCents - s.paidCents))} · ${status}`;
  };
  const lines: ReceiptLine[] =
    statuses.length > 1 ? statuses.map((s) => ({ socioId: s.socioId, name: nameOf(s.socioId), detail: detailOf(s) })) : [];

  return (
    <VStack gap={6} testID="my-cuota">
      <CuotaReceiptCard periodKey={periodKey} receipt={receipt} lines={lines} />
      {receipt.status === 'al_dia' ? null : (
        <CuotaPayWith
          bizum={cuota.bizum}
          iban={cuota.iban}
          concept={own ? cuotaConcept(periodKey, own.displayName) : null}
          instructions={cuota.payInstructions}
        />
      )}
      <CuotaPaidList entries={paidEntries(payments)} nameOf={rows.length > 1 ? nameOf : null} />
    </VStack>
  );
}
