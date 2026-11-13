import { useMemo } from 'react';
import { periodLabel } from '@cultuvilla/shared/models/organization';
import { Card, HStack, Text, VStack } from '../../primitives';
import { MyPersonasSocios } from './MyPersonasSocios';
import { SocioPill } from './SocioPill';
import { CUOTA_PILL_TONE } from './SocioSheet';
import { useT } from '../../../lib/i18n';
import { useMyCuota } from '../../../lib/orgs/useMyCuota';

/**
 * The top of the Socios screen: the member's own ficha — their socio number,
 * this period's cuota — and their personas a cargo as chips.
 */
export function MySocioRecord({ orgId, uid }: { orgId: string; uid: string }) {
  const { t } = useT();
  const { periodKey, rows, statuses } = useMyCuota(orgId, uid);
  const own = useMemo(() => rows.find((r) => r.kind === 'member' && r.uid === uid) ?? null, [rows, uid]);
  const ownStatus = own ? statuses.find((s) => s.socioId === own.id) : undefined;

  return (
    <Card testID="my-socio-record">
      <VStack gap={3}>
        {own ? (
          <HStack gap={2} align="center" justify="between">
            <VStack gap={0} className="flex-1">
              <Text variant="caption" tone="muted">
                {t('groups.socios.myRecord')}
              </Text>
              <Text variant="h3" testID="my-socio-number">
                {own.socioNumber !== null
                  ? t('groups.socios.myNumber', { number: String(own.socioNumber) })
                  : t('groups.socios.mySocio')}
              </Text>
            </VStack>
            {ownStatus && periodKey ? (
              <SocioPill
                tone={CUOTA_PILL_TONE[ownStatus.status]}
                label={t('groups.socios.myCuota', {
                  period: periodLabel(periodKey),
                  status: t(`groups.cuota.status.${ownStatus.status}`).toLowerCase(),
                })}
                testID="my-socio-cuota"
              />
            ) : null}
          </HStack>
        ) : null}
        <MyPersonasSocios orgId={orgId} uid={uid} />
      </VStack>
    </Card>
  );
}
