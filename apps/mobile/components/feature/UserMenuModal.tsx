import { routes } from '../../lib/navigation/routes';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  ScrollView,
  Animated,
  Dimensions,
  Share,
  Linking,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { Avatar } from '../primitives/Avatar';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useAuth } from '../../lib/auth/useAuth';
import { useIsAppAdmin } from '../../lib/auth/useIsAppAdmin';
import { useT } from '../../lib/i18n';
import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { getUserMemberships } from '@cultuvilla/shared/services/villageMemberService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export type UserMenuModalProps = {
  visible: boolean;
  onClose: () => void;
};

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  comingSoon?: boolean;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

export function UserMenuModal({ visible, onClose }: UserMenuModalProps) {
  const { user, profile, signOut } = useAuth();
  const { isAppAdmin } = useIsAppAdmin();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [villageCount, setVillageCount] = useState(0);

  useEffect(() => {
    if (!visible || !user) return;
    let cancelled = false;
    getPersonByUserId(user.uid, user.uid)
      .then((p) => {
        if (!cancelled) setPhotoURL(p?.photoURL ?? null);
      })
      .catch(() => {
        /* best-effort avatar; the menu renders without it */
      });
    getUserMemberships(user.uid)
      .then((ms) => {
        if (!cancelled) setVillageCount(ms.length);
      })
      .catch(() => {
        /* best-effort; leave count at 0 → item stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [visible, user]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      fadeAnim.setValue(0);
    }
  }, [visible, slideAnim, fadeAnim]);

  function close(after?: () => void) {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 240, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start(() => {
      onClose();
      after?.();
    });
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(tabs)');
  }

  const sections: MenuSection[] = [
    {
      title: t('menu.section.account'),
      items: [
        {
          icon: 'person-circle-outline',
          label: t('menu.editProfile'),
          onPress: () => close(() => router.push(routes.profile)),
        },
        {
          icon: 'ticket-outline',
          label: t('menu.mySignups'),
          onPress: () => close(() => router.push(routes.myRegistrations)),
        },
        {
          icon: 'settings-outline',
          label: t('menu.settings'),
          onPress: () => close(() => router.push(routes.settings)),
        },
      ],
    },
    {
      title: t('menu.section.villages'),
      items: [
        ...((villageCount > 1
          ? [
              {
                icon: 'swap-horizontal-outline',
                label: t('menu.switchVillage'),
                onPress: () => close(() => router.push(routes.myVillages)),
              },
            ]
          : []) as MenuItem[]),
        {
          icon: 'search-outline',
          label: t('menu.findVillage'),
          onPress: () => close(() => router.push(routes.discover)),
        },
      ],
    },
    {
      title: t('menu.section.support'),
      items: [
        {
          icon: 'chatbox-ellipses-outline',
          label: t('menu.suggestions'),
          onPress: async () => {
            try {
              await Linking.openURL('mailto:cultuvilla.app@gmail.com');
            } catch {
              // best-effort
            }
          },
        },
      ],
    },
    {
      title: t('menu.section.legal'),
      items: [
        {
          icon: 'document-text-outline',
          label: t('menu.terms'),
          onPress: () => close(() => router.push(routes.terms)),
        },
        {
          icon: 'shield-checkmark-outline',
          label: t('menu.privacy'),
          onPress: () => close(() => router.push(routes.privacy)),
        },
      ],
    },
    ...(isAppAdmin
      ? [
          {
            title: t('admin.title'),
            items: [
              {
                icon: 'shield-checkmark-outline' as const,
                label: t('admin.profileEntry'),
                onPress: () => close(() => router.push('/admin')),
              },
            ],
          },
        ]
      : []),
    {
      title: t('menu.section.app'),
      items: [
        {
          icon: 'star-outline',
          label: t('menu.rateApp'),
          comingSoon: true,
        },
        {
          icon: 'share-social-outline',
          label: t('menu.shareApp'),
          onPress: async () => {
            try {
              await Share.share({ message: 'https://cultuvilla.es' });
            } catch {
              // best-effort
            }
          },
        },
      ],
    },
  ];

  const displayName = profile?.displayName ?? '';
  const email = profile?.email ?? '';
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0, 0, 0, 0.5)', opacity: fadeAnim },
        ]}
      >
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: SCREEN_HEIGHT,
            backgroundColor: '#ffffff',
            transform: [{ translateY: slideAnim }],
          }}
        >
          <View
            className="flex-row items-center justify-between px-4 border-b border-subtle"
            style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
          >
            <Text variant="h1" className="text-accent">
              {t('menu.title')}
            </Text>
            <Pressable
              onPress={() => close()}
              accessibilityLabel={t('menu.close')}
              className="p-2 -mr-2"
            >
              <Ionicons name="close" size={26} color="#0f172a" />
            </Pressable>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          >
            <View className="flex-row items-center gap-3 mb-6">
              <Avatar
                uri={photoURL ?? undefined}
                size={64}
                initials={(displayName || email || '?').charAt(0).toUpperCase()}
              />
              <View className="flex-1">
                {displayName ? (
                  <Text variant="body" className="font-semibold">
                    {displayName}
                  </Text>
                ) : null}
                {email ? (
                  <Text variant="caption" tone="muted">
                    {email}
                  </Text>
                ) : null}
              </View>
            </View>

            {sections.map((section) => (
              <View key={section.title} className="mb-6">
                <Text variant="caption" tone="muted" className="mb-2 uppercase">
                  {section.title}
                </Text>
                <View className="bg-surface rounded-md border border-subtle">
                  {section.items.map((item, idx) => {
                    const disabled = item.comingSoon || !item.onPress;
                    const rowClass =
                      'flex-row items-center px-4 py-3 ' +
                      (idx < section.items.length - 1 ? 'border-b border-subtle' : '');
                    return (
                      <Pressable
                        key={item.label}
                        onPress={() => {
                          if (item.onPress) item.onPress();
                        }}
                        disabled={disabled}
                        className={rowClass}
                      >
                        <Ionicons
                          name={item.icon}
                          size={22}
                          color={disabled ? '#94a3b8' : '#0f172a'}
                        />
                        <Text className="flex-1 ml-3" tone={disabled ? 'muted' : 'primary'}>
                          {item.label}
                        </Text>
                        {item.comingSoon ? (
                          <Text variant="caption" tone="muted" className="uppercase">
                            {t('menu.comingSoon')}
                          </Text>
                        ) : (
                          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Text variant="caption" tone="muted" className="text-center mb-4">
              {t('menu.version', { version: appVersion })}
            </Text>

            <Pressable
              onPress={() => close(() => void handleSignOut())}
              className="flex-row items-center justify-center bg-surface rounded-md border border-subtle py-4"
            >
              <Ionicons name="log-out-outline" size={20} color="#dc2626" />
              <Text tone="danger" className="ml-2 font-semibold">
                {t('menu.signOut')}
              </Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
