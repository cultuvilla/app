import { routes } from '../../lib/navigation/routes';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth/useAuth';
import { useT } from '../../lib/i18n';
import { useRegisterGate } from '../../lib/auth/RegisterGateContext';
import { useGuestActiveVillage } from '../../lib/village/GuestActiveVillageContext';

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { t } = useT();
  const gate = useRegisterGate();
  const { guestVillageId } = useGuestActiveVillage();

  if (loading) return null;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Crossfade between tabs so the shared header/stats/buttons appear to
        // stay put while only the content swaps (village ↔ profile share a layout).
        animation: 'fade',
        tabBarActiveTintColor: '#bb5d3a',
        tabBarInactiveTintColor: '#a6a897',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.explora'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mi-pueblo"
        options={{
          title: t('tabs.village'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // A guest who opened a shared village link keeps a viewable active
            // village — let them re-open the tab instead of gating it.
            if (!user && !guestVillageId) {
              e.preventDefault();
              gate.requireAuth(routes.myVillage, t('guest.village'));
            }
          },
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) { e.preventDefault(); gate.requireAuth(routes.profile, t('guest.profile')); }
          },
        }}
      />
    </Tabs>
  );
}
