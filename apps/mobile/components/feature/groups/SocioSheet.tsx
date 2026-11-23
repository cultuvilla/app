import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isActiveSocio, type CuotaStatus, type SocioCuotaStatus } from '@cultuvilla/shared/models/organization';
import type { Socio } from '@cultuvilla/shared/services/socioService';
import { colors, iconSizes } from '@cultuvilla/shared/design-system';
import { formatDate } from '@cultuvilla/shared/utils';
import { Avatar, BottomSheet, HStack, Pressable, Text, VStack } from '../../primitives';
import { SocioPill, type SocioPillTone } from './SocioPill';
import { useT } from '../../../lib/i18n';
import { initialsOf } from '../../../lib/orgs/socioRoster';

export const CUOTA_PILL_TONE: Record<CuotaStatus, SocioPillTone> = { al_dia: 'ok', pendiente: 'pending', vencida: 'late' };

export type SocioAction = 'edit' | 'link' | 'number' | 'title' | 'role' | 'baja' | 'remove';

export interface SocioSheetProps {
  socio: Socio | null;
  /** "Con la app", "Sin la app", "A cargo de …". */
  kindLabel: string;
  /** The contact the junta may see, or why there is none. Null for a persona. */
  contact: string | null;
  cuota: SocioCuotaStatus | undefined;
  /** The row's member is an org admin. */
  isAdminRow: boolean;
  /** Another member's row: their role and their place in the group are the junta's to change. */
  canManageMember: boolean;
  onAction: (action: SocioAction) => void;
  onClose: () => void;
}

/**
 * One socio's record for the junta, with everything it can do to it — the
 * dangerous actions last and in red. A baja's record has no actions.
 */
export function SocioSheet({ socio, kindLabel, contact, cuota, isAdminRow, canManageMember, onAction, onClose }: SocioSheetProps) {
  const { t } = useT();
  const name = socio ? socio.displayName || t('groups.socios.unnamed') : '';
  const active = socio ? isActiveSocio(socio) : false;

  const actions: { key: SocioAction; testID: string; icon: keyof typeof Ionicons.glyphMap; label: string; danger?: boolean }[] = [];
  if (socio && active) {
    if (socio.kind === 'typed') {
      actions.push({ key: 'edit', testID: `socio-edit-${socio.id}`, icon: 'create-outline', label: t('groups.socios.sheet.edit') });
      actions.push({ key: 'link', testID: `socio-link-${socio.id}`, icon: 'link-outline', label: t('groups.socios.link') });
    } else {
      actions.push({ key: 'number', testID: `socio-number-${socio.id}`, icon: 'pricetag-outline', label: t('groups.socios.sheet.number') });
    }
    if (isAdminRow) actions.push({ key: 'title', testID: `socio-title-${socio.id}`, icon: 'ribbon-outline', label: t('groups.socios.sheet.title') });
    if (canManageMember) {
      actions.push({
        key: 'role',
        testID: `socio-role-${socio.id}`,
        icon: 'key-outline',
        label: t(isAdminRow ? 'groups.socios.sheet.demote' : 'groups.socios.sheet.promote'),
      });
    }
    if (socio.kind !== 'member') actions.push({ key: 'baja', testID: `socio-baja-${socio.id}`, icon: 'exit-outline', label: t('groups.socios.sheet.baja'), danger: true });
    if (canManageMember) actions.push({ key: 'remove', testID: `socio-remove-${socio.id}`, icon: 'person-remove-outline', label: t('groups.socios.sheet.remove'), danger: true });
  }

  const record = socio
    ? [
        socio.socioNumber !== null ? t('groups.socios.numberShort', { number: String(socio.socioNumber) }) : null,
        t('groups.socios.alta', { date: formatDate(socio.altaAt) }),
        socio.bajaAt ? t('groups.socios.baja', { date: formatDate(socio.bajaAt) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <BottomSheet visible={socio !== null} onClose={onClose} closeLabel={t('common.close')} testID="socio-sheet">
      <ScrollView style={{ flexShrink: 1 }}>
        <VStack gap={3} className="px-5 pb-2">
          <HStack gap={3} align="center">
            <Avatar size={48} initials={initialsOf(name)} />
            <VStack gap={0} className="flex-1">
              <Text variant="h3">{name}</Text>
              <Text variant="bodySm" tone="muted">
                {record}
              </Text>
              <Text variant="bodySm" tone="muted">
                {kindLabel}
              </Text>
            </VStack>
          </HStack>

          {contact || cuota ? (
            <VStack gap={2} className="bg-surface rounded-lg p-3">
              {contact ? (
                <Text selectable testID="socio-sheet-contact">
                  {contact}
                </Text>
              ) : null}
              {cuota ? (
                <HStack>
                  <SocioPill
                    tone={CUOTA_PILL_TONE[cuota.status]}
                    label={t('groups.socios.sheet.cuota', { status: t(`groups.cuota.status.${cuota.status}`) })}
                    testID="socio-sheet-cuota"
                  />
                </HStack>
              ) : null}
            </VStack>
          ) : null}

          <View>
            {actions.map((a) => (
              <Pressable
                key={a.key}
                testID={a.testID}
                accessibilityRole="button"
                onPress={() => onAction(a.key)}
                className="py-3 border-b border-subtle"
              >
                <HStack gap={3} align="center">
                  <Ionicons
                    name={a.icon}
                    size={iconSizes.md}
                    color={a.danger ? colors.light.fg.danger : colors.light.fg.primary}
                  />
                  <Text tone={a.danger ? 'danger' : 'primary'} className="font-medium">
                    {a.label}
                  </Text>
                </HStack>
              </Pressable>
            ))}
          </View>
        </VStack>
      </ScrollView>
    </BottomSheet>
  );
}
