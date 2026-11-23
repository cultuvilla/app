import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { isActiveSocio } from '@cultuvilla/shared/models/organization';
import { watchOrgSocios, type Socio } from '@cultuvilla/shared/services/socioService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { HStack, Pressable, Text, VStack } from '../../primitives';
import { useWatch } from '../../../lib/hooks/useWatch';
import { useT } from '../../../lib/i18n';
import { groupRecordsHref } from '../../../lib/navigation/routes';

/** An admin's way from Socios into the libro de socios, with its altas and bajas. */
export function LibroDoor({ orgId }: { orgId: string }) {
  const { t } = useT();
  const socios = useWatch<Socio[]>('groups:watchOrgSocios', orgId, (next, error) => watchOrgSocios(orgId, next, error));
  const summary = useMemo(() => {
    if (socios.status !== 'ready') return null;
    const rows = socios.data ?? [];
    const active = rows.filter(isActiveSocio).length;
    return rows.length === 0 ? t('groups.records.libro.empty') : t('groups.records.libro.summary', { active, bajas: rows.length - active });
  }, [socios.status, socios.data, t]);
  const title = t('groups.records.doors.libro');

  return (
    <Pressable
      testID="records-door-libro"
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => router.push(groupRecordsHref(orgId, 'libro'))}
      className="rounded-lg p-4 bg-surface-elevated shadow-sm"
    >
      <HStack gap={3} align="center">
        <VStack className="h-12 w-12 rounded-md bg-subtle items-center justify-center">
          <Ionicons name="book-outline" size={iconSizes.lg} color={colors.light.fg.accent} />
        </VStack>
        <VStack className="flex-1" gap={1}>
          <Text className="font-bold">{title}</Text>
          {summary ? (
            <Text variant="bodySm" tone="muted" numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </VStack>
        <Ionicons name="chevron-forward" size={iconSizes.sm} color={colors.light.fg.muted} />
      </HStack>
    </Pressable>
  );
}
