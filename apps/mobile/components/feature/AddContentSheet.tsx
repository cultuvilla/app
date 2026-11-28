import {
  createEventHref,
  createNewsHref,
  newHistoryEntryHref,
  newWordHref,
  villageSectionHref,
} from '../../lib/navigation/routes';
import { Pressable as RNPressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { ORG_TYPE_QUERY } from '@cultuvilla/shared/models/organization/OrganizationDataModel';
import { router } from 'expo-router';
import { BottomSheet, Text, HStack } from '../primitives';
import { ACCENT } from './VillageSections';
import { useT } from '../../lib/i18n';

interface AddContentSheetProps {
  visible: boolean;
  onClose: () => void;
  villageId: string;
  /** The pueblo's URL slug — every create route it opens is village-first. */
  villageSlug: string;
  /** When true, prepend the admin-only "Detalles pueblo" row opening the edit stepper. */
  canManage: boolean;
}

interface AddOption {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Route to push (already scoped to the village). */
  href: string;
}

// The entities the village home can add, in the same order the sections
// appear on the screen. Each row just fans out to the entity's existing create
// route — no create logic lives here. Peña and agrupación share the org create
// screen; the `type` query preselects its picker (asociación = the non-peña
// default, since "agrupación" is the whole non-peña bucket).
function optionsFor(villageId: string, villageSlug: string, canManage: boolean): AddOption[] {
  return [
    // Admin-only: opens the village edit stepper (was formerly the "Editar pueblo" pill).
    ...(canManage
      ? [{ key: 'detalles', icon: 'create-outline' as const, href: villageSectionHref(villageSlug, 'comunidad') }]
      : []),
    { key: 'evento', icon: 'calendar-outline', href: createEventHref({ villageId }) },
    { key: 'articulo', icon: 'newspaper-outline', href: createNewsHref({ villageId }) },
    { key: 'agrupacion', icon: 'business-outline', href: villageSectionHref(villageSlug, 'entidades', `type=${ORG_TYPE_QUERY['asociación']}`) },
    { key: 'pena', icon: 'people-circle-outline', href: villageSectionHref(villageSlug, 'entidades', `type=${ORG_TYPE_QUERY['peña']}`) },
    { key: 'barrio', icon: 'map-outline', href: villageSectionHref(villageSlug, 'barrios') },
    { key: 'lugar', icon: 'location-outline', href: villageSectionHref(villageSlug, 'lugares') },
    { key: 'cartel', icon: 'image-outline', href: villageSectionHref(villageSlug, 'carteles') },
    { key: 'palabra', icon: 'book-outline', href: newWordHref(villageSlug) },
    { key: 'acontecimiento', icon: 'time-outline', href: newHistoryEntryHref(villageSlug) },
  ];
}

/** Bottom action sheet opened from the village home's "Añadir contenido" button. */
export function AddContentSheet({ visible, onClose, villageId, villageSlug, canManage }: AddContentSheetProps) {
  const { t } = useT();

  const pick = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('village.addContent.title')}
      closeLabel={t('common.close')}
      maxHeightRatio={0.92}
      testID="add-content-sheet"
    >
      {/* Every option fits on a phone; the ScrollView is the fallback for a
          viewport too short to hold the whole list. */}
      <ScrollView>
        {optionsFor(villageId, villageSlug, canManage).map((opt) => (
          <RNPressable
            key={opt.key}
            onPress={() => pick(opt.href)}
            accessibilityLabel={t(`village.addContent.items.${opt.key}`)}
            className="border-b border-subtle active:opacity-70"
          >
            <HStack gap={3} className="items-center px-5 py-4">
              <Ionicons name={opt.icon} size={24} color={ACCENT} />
              <Text className="flex-1 font-semibold">
                {t(`village.addContent.items.${opt.key}`)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.light.fg.chevron} />
            </HStack>
          </RNPressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}
