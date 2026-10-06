import {
  createEventHref,
  createNewsHref,
  newHistoryEntryHref,
  newWordHref,
  villageSectionHref,
} from '../../lib/navigation/routes';
import { Modal, Pressable as RNPressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, HStack } from '../primitives';
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
    { key: 'agrupacion', icon: 'business-outline', href: villageSectionHref(villageSlug, 'entidades', 'type=asociacion') },
    { key: 'pena', icon: 'people-circle-outline', href: villageSectionHref(villageSlug, 'entidades', 'type=pena') },
    { key: 'barrio', icon: 'map-outline', href: villageSectionHref(villageSlug, 'barrios') },
    { key: 'lugar', icon: 'location-outline', href: villageSectionHref(villageSlug, 'lugares') },
    { key: 'cartel', icon: 'image-outline', href: villageSectionHref(villageSlug, 'carteles') },
    { key: 'palabra', icon: 'book-outline', href: newWordHref(villageSlug) },
    { key: 'acontecimiento', icon: 'time-outline', href: newHistoryEntryHref(villageSlug) },
  ];
}

/**
 * Bottom action sheet opened from the village home's "Añadir contenido" button.
 * Uses a fade-in Modal + bottom-anchored card (not an Animated translateY) so it
 * behaves on the web build, where RN-Web translateY springs don't move.
 */
export function AddContentSheet({ visible, onClose, villageId, villageSlug, canManage }: AddContentSheetProps) {
  const { t } = useT();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const pick = (href: string) => {
    onClose();
    router.push(href as never);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* absoluteFillObject (not flex-1): RN-Web collapses a flex-1 Modal child to
          zero height, leaving no tappable backdrop to dismiss the sheet. */}
      <RNPressable
        accessible={false}
        onPress={onClose}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
        ]}
      >
        <RNPressable
          accessible={false}
          onPress={() => {}}
          className="bg-surface-elevated border-t border-subtle"
          style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 12 }}
        >
          {/* Tapping the grab handle also dismisses — the primary close affordance
              on web, where there's no swipe-down gesture. */}
          <RNPressable onPress={onClose} className="items-center pt-3 pb-1 active:opacity-60">
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1' }} />
          </RNPressable>
          {/* Explicit X close button: on web mobile there's no Escape key, no
              hardware back, and no swipe-to-dismiss (RN-Web translateY springs
              don't move), so the backdrop tap + hair-thin grab handle were the
              only ways out — neither discoverable. This is the primary close
              affordance. Olive title (tone primary) matches the village name;
              1px larger than option rows (body = 16), same semibold weight. */}
          <HStack gap={3} className="items-center px-5 pt-2 pb-1">
            <Text tone="primary" className="flex-1 font-semibold" style={{ fontSize: 17 }}>
              {t('village.addContent.title')}
            </Text>
            <RNPressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={12}
              className="active:opacity-60"
            >
              <Ionicons name="close" size={24} color="#94a3b8" />
            </RNPressable>
          </HStack>
          {/* No maxHeight cap: the sheet grows to fit every option so all are
              visible at a glance without scrolling. ScrollView stays only as a
              fallback for viewports too short to hold the full list. */}
          <ScrollView style={{ maxHeight: '100%' }}>
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
                  <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                </HStack>
              </RNPressable>
            ))}
          </ScrollView>
        </RNPressable>
      </RNPressable>
    </Modal>
  );
}
