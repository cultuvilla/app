import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@cultuvilla/shared/design-system';
import { Screen, VStack, Text } from '../../components/primitives';
import { ScreenHeader } from '../../components/layout/ScreenHeader';
import { useT } from '../../lib/i18n';

type CardSpec = {
  href: '/admin/solicitudes-organizador' | '/admin/denuncias';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
};

export default function AdminHubScreen() {
  const { t } = useT();
  const cards: CardSpec[] = [
    {
      href: '/admin/solicitudes-organizador',
      icon: 'person-add-outline',
      title: t('admin.hub.organizerRequests'),
      hint: t('admin.hub.organizerRequestsHint'),
    },
    {
      href: '/admin/denuncias',
      icon: 'flag-outline',
      title: t('admin.hub.reports'),
      hint: t('admin.hub.reportsHint'),
    },
  ];

  return (
    <Screen padded={false}>
      <ScreenHeader title={t('admin.title')} />
      <VStack gap={2} className="p-4">
        {cards.map((c) => (
          <Pressable
            key={c.href}
            onPress={() => router.push(c.href)}
            className="flex-row items-center bg-surface border border-subtle rounded-xl p-3"
          >
            <Ionicons name={c.icon} size={20} color={colors.light.fg.strong} />
            <View className="ml-3 flex-1">
              <Text>{c.title}</Text>
              <Text tone="muted" variant="caption">{c.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.fg.chevron} />
          </Pressable>
        ))}
      </VStack>
    </Screen>
  );
}
