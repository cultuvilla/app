import './../global.css';
import { Redirect, Stack, useSegments, router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { bootstrapFirebase } from '../lib/firebaseInit';
import { bootstrapObservability } from '../lib/observability/configure';
import { ObservabilityErrorBoundary } from '../lib/observability/ObservabilityErrorBoundary';
import { AppVersionGate } from '../components/AppVersionGate';
import { OfflineBanner } from '../components/feature/OfflineBanner';
import { IntroHost, useMarkAppReady } from '../components/intro/IntroHost';
import { AuthProvider } from '../lib/auth/AuthContext';
import { CallableErrorProvider } from '../lib/callableError';
import { I18nProvider } from '../lib/i18n';
import { useAuth } from '../lib/auth/useAuth';
import { resolveAuthRoute, resolveIntentResume } from '../lib/auth/authRoute';
import { RegisterGateProvider, useRegisterGate } from '../lib/auth/RegisterGateContext';
import { GuestActiveVillageProvider } from '../lib/village/GuestActiveVillageContext';
import { MyRegistrationsProvider } from '../lib/registrations/MyRegistrationsContext';
import { PushProvider } from '../lib/push/PushProvider';
import { useDeepLinkRouter } from '../lib/deeplink/useDeepLinkRouter';
import { useRouteTracking } from '../lib/observability/useRouteTracking';
import { ActivityIndicator, View } from 'react-native';

bootstrapFirebase();
bootstrapObservability();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fraunces_700Bold });
  return (
    // I18nProvider sits above IntroHost so the intro's skip label is translated;
    // IntroHost sits above the font gate so the intro covers that wait too.
    <I18nProvider>
      <IntroHost>
        {fontsLoaded ? (
          <AppTree />
        ) : (
          <View className="flex-1 items-center justify-center bg-surface">
            <ActivityIndicator />
          </View>
        )}
      </IntroHost>
    </I18nProvider>
  );
}

function AppTree() {
  return (
    <SafeAreaProvider>
      <ObservabilityErrorBoundary
        fallback={
          <View className="flex-1 items-center justify-center bg-surface">
            <ActivityIndicator />
          </View>
        }
      >
        <AppVersionGate>
          <CallableErrorProvider>
            <AuthProvider>
              <GuestActiveVillageProvider>
                <MyRegistrationsProvider>
                  <PushProvider>
                    <RegisterGateProvider>
                      <AuthGate />
                      <OfflineBanner />
                    </RegisterGateProvider>
                  </PushProvider>
                </MyRegistrationsProvider>
              </GuestActiveVillageProvider>
            </AuthProvider>
          </CallableErrorProvider>
        </AppVersionGate>
      </ObservabilityErrorBoundary>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { user, loading, profile, profileChecked } = useAuth();
  const segments = useSegments();
  useRouteTracking();
  useDeepLinkRouter();
  const { pendingIntent, clearPending } = useRegisterGate();
  const markAppReady = useMarkAppReady();

  const intentTarget = resolveIntentResume({
    user: !!user,
    profileChecked,
    hasPersonId: !!profile?.personId,
    pendingIntent,
  });

  useEffect(() => {
    if (intentTarget) {
      clearPending();
      // Lay down the tabs home as the base BEFORE pushing the resumed target,
      // so the target screen has somewhere to pop back to. Replacing straight
      // to a deep screen (e.g. /event/new) leaves an empty stack and the back
      // button errors with "GO_BACK was not handled by any navigator".
      router.replace('/(tabs)');
      router.push(intentTarget as Href);
    }
  }, [intentTarget, clearPending]);

  // The intro holds the screen until the first real route is decided.
  const resolving = loading || (user && !profileChecked) || !!intentTarget;
  useEffect(() => {
    if (!resolving) markAppReady();
  }, [resolving, markAppReady]);

  if (loading || (user && !profileChecked)) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator />
      </View>
    );
  }

  // While resuming, suppress the default /(tabs) redirect so the replace wins.
  if (intentTarget) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator />
      </View>
    );
  }

  const target = resolveAuthRoute({
    user: !!user,
    profileChecked,
    hasPersonId: !!profile?.personId,
    topSegment: segments[0],
  });
  if (target) {
    return <Redirect href={target} />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
