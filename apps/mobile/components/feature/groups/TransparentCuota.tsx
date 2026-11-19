import { periodLabel } from '@cultuvilla/shared/models/organization';
import { fetchTransparentCuota } from '@cultuvilla/shared/services/groupTransparencyService';
import { Card, HStack, Text, VStack } from '../../primitives';
import { useT } from '../../../lib/i18n';
import { useGroupTransparency } from '../../../lib/orgs/useGroupTransparency';

/**
 * "Cuota pública": the socios of the current period, each with their name and
 * whether they are al día. The callable sends nothing more — no amounts, dates,
 * methods or receipts — so there is nothing more to show.
 */
export function TransparentCuota({ orgId }: { orgId: string }) {
  const { t } = useT();
  const state = useGroupTransparency(`cuota|${orgId}`, () => fetchTransparentCuota(orgId));

  if (state.status === 'error') {
    return (
      <Text tone="muted" variant="bodySm" testID="transparent-cuota-error">
        {t('groups.transparency.error')}
      </Text>
    );
  }
  if (state.status !== 'ready' || !state.data.periodKey) return null;
  const { periodKey, socios } = state.data;
  const alDia = socios.filter((s) => s.status === 'al_dia').length;

  return (
    <VStack gap={2} testID="transparent-cuota">
      <Text className="font-bold">{t('groups.transparency.cuota.title', { period: periodLabel(periodKey) })}</Text>
      {socios.length === 0 ? (
        <Text tone="muted" variant="bodySm">
          {t('groups.transparency.cuota.empty')}
        </Text>
      ) : (
        <Card>
          <VStack gap={1}>
            <Text variant="caption" tone="muted" testID="transparent-cuota-summary">
              {t('groups.transparency.cuota.summary', { alDia, pendiente: socios.length - alDia })}
            </Text>
            {socios.map((s) => (
              <HStack key={s.socioId} justify="between" align="center" className="py-1 border-b border-subtle" testID={`transparent-cuota-row-${s.socioId}`}>
                <Text className="flex-1">{s.displayName}</Text>
                <Text variant="bodySm" tone={s.status === 'al_dia' ? 'success' : 'muted'} className="font-bold">
                  {t(`groups.transparency.cuota.status.${s.status}`)}
                </Text>
              </HStack>
            ))}
          </VStack>
        </Card>
      )}
    </VStack>
  );
}
