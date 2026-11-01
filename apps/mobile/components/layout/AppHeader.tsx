import { routes } from '../../lib/navigation/routes';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useAuth } from '../../lib/auth/useAuth';
import { useRegisterGate } from '../../lib/auth/RegisterGateContext';
import { useActiveVillageId } from '../../lib/village/useActiveVillageId';
import { useUnreadInboxCount } from '../../lib/hooks/useUnreadInboxCount';
import { useT } from '../../lib/i18n';
import { getMunicipality } from '@cultuvilla/shared/services/municipalityService';
import { UserMenuModal } from '../feature/UserMenuModal';

export type AppHeaderProps = {
  /** Optional override for the title (defaults to active municipality name). */
  centerLabel?: string;
  /** Extra content rendered in the right slot, before the notifications/menu icons. */
  extraRightSlot?: ReactNode;
};

export function AppHeader({ centerLabel, extraRightSlot }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const activeMunicipalityId = useActiveVillageId();
  const gate = useRegisterGate();
  const { t } = useT();
  const { count: unreadCount, refresh: refreshUnread } = useUnreadInboxCount();
  const [municipalityName, setMunicipalityName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshUnread();
    }, [refreshUnread]),
  );

  useEffect(() => {
    let cancelled = false;
    if (!activeMunicipalityId) {
      setMunicipalityName(null);
      return;
    }
    getMunicipality(activeMunicipalityId).then((m) => {
      if (!cancelled) setMunicipalityName(m?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [activeMunicipalityId]);

  const label = centerLabel ?? municipalityName ?? t('header.noVillage');

  return (
    <>
      <StatusBar style="light" />
      <View
        className="bg-accent"
        style={{ paddingTop: insets.top }}
      >
        {/* pb is 2px under the pb-3 token (10px) to balance the perceived gap above vs below the row. */}
        <View className="flex-row items-center px-3 pt-1" style={{ paddingBottom: 10 }}>
          <View className="flex-1">
            <Text
              variant="h3"
              tone="onAccent"
              numberOfLines={1}
              style={{ fontFamily: 'Fraunces_700Bold', letterSpacing: 0.3 }}
            >
              {label}
            </Text>
          </View>

          <View className="flex-row items-center gap-1">
            {extraRightSlot}
            <Pressable
              onPress={() => router.push(routes.inbox)}
              accessibilityLabel={t('header.openNotifications')}
              className="p-1"
            >
              <View>
                <Ionicons name="notifications" size={28} color="#f9f0e8" />
                {unreadCount > 0 && (
                  <View
                    className="absolute -top-1 -right-1 bg-danger rounded-full items-center justify-center px-1"
                    style={{ minWidth: 16, height: 16 }}
                  >
                    <Text variant="caption" tone="onAccent" style={{ fontSize: 10, lineHeight: 12 }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => {
                // The menu is entirely auth-only (profile, sign-out, my
                // signups); guests get the RegisterSheet instead.
                if (user) setMenuOpen(true);
                else gate.requireAuth(routes.profile, t('guest.menu'));
              }}
              accessibilityLabel={t('header.openMenu')}
              className="p-1 -mr-1"
            >
              <Ionicons name="menu-sharp" size={30} color="#f9f0e8" />
            </Pressable>
          </View>
        </View>
      </View>
      <UserMenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
