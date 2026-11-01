import { useMemo } from 'react';
import { groupMessageRecipientValues, type GroupMessagePersonalValues } from '@cultuvilla/shared/models/organization';
import { useMyCuota } from './useMyCuota';

/**
 * The reader's own values for a group message's placeholders. In the app they
 * are live: a cuota paid since the message was sent no longer shows as owed.
 * A null `uid` reads nothing.
 */
export function useMyMessageValues(orgId: string, uid: string | null): GroupMessagePersonalValues {
  const { rows, statuses } = useMyCuota(orgId, uid);
  return useMemo(() => {
    const own = rows.find((r) => r.kind === 'member' && r.uid === uid);
    return groupMessageRecipientValues({
      holderName: own?.displayName ?? null,
      holderNumber: own?.socioNumber ?? null,
      socioIds: rows.map((r) => r.id),
      statuses,
    });
  }, [rows, statuses, uid]);
}
